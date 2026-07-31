/**
 * Email provider adapters.
 * Demo simulates mail; Gmail uses OAuth refresh token via googleapis.
 */

import { google } from "googleapis";
import { nanoid } from "nanoid";
import { getSetting, setSetting } from "../db/models.js";

function decodeBody(data) {
  if (!data) return "";
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function walkParts(payload, out = { text: "", html: "" }) {
  if (!payload) return out;
  const mime = payload.mimeType || "";
  if (payload.body?.data) {
    const decoded = decodeBody(payload.body.data);
    if (mime === "text/plain" && !out.text) out.text = decoded;
    if (mime === "text/html" && !out.html) out.html = decoded;
  }
  for (const part of payload.parts || []) walkParts(part, out);
  return out;
}

function headerMap(headers = []) {
  const map = {};
  for (const h of headers) {
    if (h.name) map[h.name.toLowerCase()] = h.value || "";
  }
  return map;
}

function parseAddressList(raw = "") {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => {
      const m = s.match(/<([^>]+)>/);
      return (m ? m[1] : s).trim().toLowerCase();
    })
    .filter(Boolean);
}

function parseFrom(raw = "") {
  const m = raw.match(/^(.*)<([^>]+)>$/);
  if (m) {
    return {
      name: m[1].replace(/"/g, "").trim() || m[2].trim(),
      email: m[2].trim().toLowerCase(),
    };
  }
  return { name: raw.trim(), email: raw.trim().toLowerCase() };
}

export class DemoProvider {
  constructor() {
    this.name = "demo";
  }

  async fetchNewMessages() {
    if (Math.random() > 0.35) return [];

    const clients = [
      { name: "Lee Harper", email: "lee@orbitapps.com" },
      { name: "Quinn Adler", email: "quinn@pixelcraft.io" },
      { name: "Sasha Kim", email: "sasha@northwind.co" },
    ];
    const suffixes = ["support", "billing", "projectA", "clientX", "onboarding"];
    const subjects = [
      "Quick question about pricing",
      "Need help with integration",
      "Follow-up on last week's call",
      "Account access issue",
      "Updating billing contacts",
    ];
    const client = clients[Math.floor(Math.random() * clients.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    const subject = subjects[Math.floor(Math.random() * subjects.length)];

    return [
      {
        threadExternalId: `ext_${nanoid(8)}`,
        externalId: `msg_${nanoid(8)}`,
        subject,
        fromEmail: client.email,
        fromName: client.name,
        toEmails: [`support+${suffix}@company.com`],
        bodyText: `Hi support team,\n\n${subject}. Could someone take a look when you have a moment?\n\nThanks,\n${client.name}`,
        bodyHtml: `<p>Hi support team,</p><p>${subject}. Could someone take a look when you have a moment?</p><p>Thanks,<br/>${client.name}</p>`,
        sentAt: new Date().toISOString(),
        detectedSuffix: suffix,
      },
    ];
  }
}

export class GmailProvider {
  constructor(config = {}) {
    this.name = "gmail";
    this.config = config;
  }

  getClient() {
    const oauth2 = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret
    );
    oauth2.setCredentials({ refresh_token: this.config.refreshToken });
    return google.gmail({ version: "v1", auth: oauth2 });
  }

  mapMessage(msg) {
    const headers = headerMap(msg.payload?.headers || []);
    const from = parseFrom(headers.from || "");
    const toEmails = parseAddressList(headers.to || "");
    const ccEmails = parseAddressList(headers.cc || "");
    const bodies = walkParts(msg.payload);
    const bodyText =
      bodies.text ||
      (bodies.html
        ? bodies.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : "") ||
      msg.snippet ||
      "";

    const internalDate = msg.internalDate
      ? new Date(Number(msg.internalDate)).toISOString()
      : new Date().toISOString();

    return {
      threadExternalId: msg.threadId,
      externalId: msg.id,
      subject: headers.subject || "(no subject)",
      fromEmail: from.email,
      fromName: from.name,
      toEmails,
      ccEmails,
      bodyText,
      bodyHtml: bodies.html || `<p>${bodyText.replace(/\n/g, "<br/>")}</p>`,
      sentAt: internalDate,
    };
  }

  async ensureMailboxCursor(gmail) {
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = (profile.data.emailAddress || "").toLowerCase();
    const previous = ((await getSetting("gmail_synced_mailbox")) || "").toLowerCase();

    if (email && previous && email !== previous) {
      console.warn(`[gmail] mailbox changed ${previous} → ${email}; resetting sync cursor`);
      await setSetting("gmail_history_id", "");
      await setSetting("gmail_initial_sync_done", "false");
    }
    if (email) await setSetting("gmail_synced_mailbox", email);
    return profile;
  }

  async fetchMessageIds(gmail) {
    const profile = await this.ensureMailboxCursor(gmail);
    const historyId = await getSetting("gmail_history_id");
    const initialDone = (await getSetting("gmail_initial_sync_done")) === "true";
    const ids = new Set();

    if (historyId && initialDone) {
      try {
        let pageToken;
        do {
          const res = await gmail.users.history.list({
            userId: "me",
            startHistoryId: historyId,
            historyTypes: ["messageAdded"],
            pageToken,
          });
          for (const h of res.data.history || []) {
            for (const added of h.messagesAdded || []) {
              if (added.message?.id) ids.add(added.message.id);
            }
          }
          if (res.data.historyId) await setSetting("gmail_history_id", res.data.historyId);
          pageToken = res.data.nextPageToken;
        } while (pageToken);
        return [...ids];
      } catch (err) {
        console.warn("[gmail] history.list failed, falling back to messages.list:", err.message);
        await setSetting("gmail_initial_sync_done", "false");
      }
    }

    const limit = Number(this.config.initialSyncLimit || 40);
    const res = await gmail.users.messages.list({
      userId: "me",
      maxResults: limit,
    });

    if (profile.data.historyId) {
      await setSetting("gmail_history_id", profile.data.historyId);
    }

    return (res.data.messages || []).map((m) => m.id).filter(Boolean);
  }

  async fetchNewMessages() {
    if (!this.config.clientId || !this.config.clientSecret || !this.config.refreshToken) {
      console.warn("[gmail] Missing GMAIL_CLIENT_ID / SECRET / REFRESH_TOKEN — skipping sync.");
      return [];
    }

    const gmail = this.getClient();
    const messageIds = await this.fetchMessageIds(gmail);
    const mapped = [];

    for (const id of messageIds) {
      try {
        const res = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "full",
        });
        mapped.push(this.mapMessage(res.data));
      } catch (err) {
        console.warn(`[gmail] failed to fetch message ${id}:`, err.message);
      }
    }

    mapped.sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
    if (mapped.length) {
      await setSetting("gmail_initial_sync_done", "true");
    }
    console.log(`[gmail] synced ${mapped.length} message(s) from ${messageIds.length} id(s)`);
    return mapped;
  }
}

export class GraphProvider {
  constructor(config = {}) {
    this.name = "graph";
    this.config = config;
  }

  async fetchNewMessages() {
    if (!this.config.tenantId || !this.config.clientId) {
      console.warn("[graph] Missing credentials — skipping sync. Set AZURE_* env vars.");
      return [];
    }
    throw new Error("Microsoft Graph provider not configured with live credentials yet.");
  }
}

export function createProvider(name = "demo") {
  switch (name) {
    case "gmail":
      return new GmailProvider({
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
        initialSyncLimit: process.env.GMAIL_INITIAL_SYNC_LIMIT || 40,
      });
    case "graph":
    case "outlook":
      return new GraphProvider({
        tenantId: process.env.AZURE_TENANT_ID,
        clientId: process.env.AZURE_CLIENT_ID,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
        mailbox: process.env.SHARED_MAILBOX_EMAIL,
      });
    default:
      return new DemoProvider();
  }
}
