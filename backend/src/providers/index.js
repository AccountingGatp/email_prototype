/**
 * Email provider adapters.
 * Demo simulates mail; Gmail uses OAuth refresh token via googleapis.
 */

import { google } from "googleapis";
import { nanoid } from "nanoid";
import { getSetting, setSetting } from "../db/models.js";
import {
  STATUS_GMAIL_LABELS,
  NOISE_LABELS,
  detectCategory,
  detectNoise,
} from "../services/status.js";
import {
  getGmailRefreshToken,
  clearGmailRefreshToken,
  isGmailAuthError,
  makeGmailReauthError,
} from "../services/gmail-auth.js";

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
        snippet: `${subject}. Could someone take a look when you have a moment?`,
        bodyText: "",
        bodyHtml: "",
        sentAt: new Date().toISOString(),
        detectedSuffix: suffix,
        labelNames: ["To Respond"],
        labelIds: [],
        category: "Client Query",
        isNoise: false,
        persistBody: false,
      },
    ];
  }

  async applyStatusLabel() {
    /* no-op for demo */
  }
}

export class GmailProvider {
  constructor(config = {}) {
    this.name = "gmail";
    this.config = config;
    this._labelCache = null;
    this._statusLabelIds = null;
  }

  getClient() {
    const oauth2 = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret
    );
    oauth2.setCredentials({ refresh_token: this.config.refreshToken });
    return google.gmail({ version: "v1", auth: oauth2 });
  }

  async listLabels(gmail) {
    if (this._labelCache) return this._labelCache;
    const res = await gmail.users.labels.list({ userId: "me" });
    this._labelCache = res.data.labels || [];
    return this._labelCache;
  }

  async ensureLabel(gmail, name) {
    const labels = await this.listLabels(gmail);
    const existing = labels.find(
      (l) => (l.name || "").toLowerCase() === name.toLowerCase()
    );
    if (existing) return existing;

    try {
      const created = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      this._labelCache = null;
      return created.data;
    } catch (err) {
      console.warn(`[gmail] could not create label "${name}":`, err.message);
      return null;
    }
  }

  async ensureStatusLabels(gmail) {
    if (this._statusLabelIds) return this._statusLabelIds;
    const ids = {};
    for (const [status, name] of Object.entries(STATUS_GMAIL_LABELS)) {
      const label = await this.ensureLabel(gmail, name);
      if (label?.id) ids[status] = label.id;
    }
    for (const name of NOISE_LABELS) {
      await this.ensureLabel(gmail, name);
    }
    this._statusLabelIds = ids;
    return ids;
  }

  resolveLabelNames(labelIds, allLabels) {
    const byId = Object.fromEntries((allLabels || []).map((l) => [l.id, l.name]));
    return (labelIds || []).map((id) => byId[id] || id).filter(Boolean);
  }

  mapMessage(msg, allLabels = []) {
    const headers = headerMap(msg.payload?.headers || []);
    const from = parseFrom(headers.from || "");
    const toEmails = parseAddressList(headers.to || "");
    const ccEmails = parseAddressList(headers.cc || "");
    const labelIds = msg.labelIds || [];
    const labelNames = this.resolveLabelNames(labelIds, allLabels);
    const category = detectCategory(labelNames);
    const isNoise = detectNoise({
      labelNames,
      fromEmail: from.email,
      subject: headers.subject || "",
    });

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
      snippet: (msg.snippet || "").slice(0, 200),
      // SOP T5 — metadata only; do not persist bodies
      bodyText: "",
      bodyHtml: "",
      persistBody: false,
      sentAt: internalDate,
      labelIds,
      labelNames,
      category,
      isNoise,
    };
  }

  async applyStatusLabel(threadExternalId, status) {
    const refreshToken = this.config.refreshToken || (await getGmailRefreshToken());
    if (!this.config.clientId || !refreshToken) return;
    this.config.refreshToken = refreshToken;
    const gmail = this.getClient();
    const statusIds = await this.ensureStatusLabels(gmail);
    const addId = statusIds[status];
    if (!addId) {
      console.warn(`[gmail] missing label id for status ${status}`);
      return;
    }
    const removeIds = Object.entries(statusIds)
      .filter(([s]) => s !== status)
      .map(([, id]) => id)
      .filter(Boolean);

    try {
      await gmail.users.threads.modify({
        userId: "me",
        id: threadExternalId,
        requestBody: {
          addLabelIds: [addId],
          removeLabelIds: removeIds,
        },
      });
    } catch (err) {
      console.warn("[gmail] threads.modify failed (need gmail.modify scope?):", err.message);
      throw err;
    }
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
    const limit = Number(this.config.initialSyncLimit || 40);

    // Always pull recent inbox mail so Sync now surfaces the latest threads
    // (history alone can return 0 while the DB still only has older mail).
    try {
      const recent = await gmail.users.messages.list({
        userId: "me",
        labelIds: ["INBOX"],
        maxResults: Math.min(Math.max(limit, 50), 100),
      });
      for (const m of recent.data.messages || []) {
        if (m.id) ids.add(m.id);
      }
    } catch (err) {
      console.warn("[gmail] recent messages.list failed:", err.message);
    }

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
      } catch (err) {
        console.warn("[gmail] history.list failed, using recent list only:", err.message);
        await setSetting("gmail_initial_sync_done", "false");
      }
    } else if (!initialDone) {
      // First sync / reset: also list without INBOX-only in case mail is archived
      const res = await gmail.users.messages.list({
        userId: "me",
        maxResults: limit,
      });
      for (const m of res.data.messages || []) {
        if (m.id) ids.add(m.id);
      }
    }

    if (profile.data.historyId) {
      await setSetting("gmail_history_id", profile.data.historyId);
    }

    return [...ids];
  }

  async gmailAuthError(err) {
    if (isGmailAuthError(err)) {
      await clearGmailRefreshToken();
      return makeGmailReauthError(err);
    }
    return err instanceof Error ? err : new Error(err?.message || String(err));
  }

  async fetchNewMessages() {
    const refreshToken = this.config.refreshToken || (await getGmailRefreshToken());
    if (!this.config.clientId || !this.config.clientSecret || !refreshToken) {
      throw makeGmailReauthError(
        new Error("Missing Gmail credentials — reconnect Google from Sync")
      );
    }
    this.config.refreshToken = refreshToken;

    const gmail = this.getClient();
    try {
      await this.ensureStatusLabels(gmail);
    } catch (err) {
      console.warn("[gmail] ensureStatusLabels:", err.message);
      if (isGmailAuthError(err)) throw await this.gmailAuthError(err);
    }

    let allLabels;
    let messageIds;
    try {
      allLabels = await this.listLabels(gmail);
      messageIds = await this.fetchMessageIds(gmail);
    } catch (err) {
      throw await this.gmailAuthError(err);
    }
    const mapped = [];

    for (const id of messageIds) {
      try {
        // metadata is enough for SOP T5; headers + labels + snippet
        const res = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
        });
        mapped.push(this.mapMessage(res.data, allLabels));
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

  async applyStatusLabel() {
    /* no-op */
  }
}

export async function createProvider(name = "demo") {
  switch (name) {
    case "gmail": {
      const refreshToken = await getGmailRefreshToken();
      return new GmailProvider({
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken,
        initialSyncLimit: process.env.GMAIL_INITIAL_SYNC_LIMIT || 40,
      });
    }
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
