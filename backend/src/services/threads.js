import { nanoid } from "nanoid";
import {
  User,
  Tag,
  Thread,
  Message,
  Notification,
  getSetting,
} from "../db/models.js";
import { extractSuffix } from "./helpers.js";
import { normalizeBodyText } from "./email-body.js";
import {
  resolveStatusFromLabels,
  detectCategory,
  detectNoise,
  normalizeStatus,
  STATUSES,
} from "./status.js";
import { businessDaysAgo } from "./sla.js";
import { createProvider } from "../providers/index.js";

async function findTeamMemberByEmail(email) {
  if (!email) return null;
  return User.findOne({ email: String(email).toLowerCase() })
    .select("_id name email")
    .lean();
}

async function ensureTag(suffix, createdBy = null) {
  if (!suffix) return null;
  let tag = await Tag.findOne({ name: new RegExp(`^${suffix}$`, "i") });
  if (!tag) {
    const colors = ["#2563eb", "#16a34a", "#ca8a04", "#dc2626", "#7c3aed", "#0891b2"];
    tag = await Tag.create({
      _id: nanoid(),
      name: suffix,
      color: colors[Math.floor(Math.random() * colors.length)],
      description: `Auto-created from +${suffix}`,
      createdBy,
    });
  }
  return tag;
}

export async function recomputeThreadStatus(threadId, labelHints = null) {
  const thread = await Thread.findById(threadId);
  if (!thread) return;

  const lastIn = await Message.findOne({ threadId, isIncoming: true })
    .sort({ sentAt: -1 })
    .lean();
  const lastOut = await Message.findOne({ threadId, isIncoming: false })
    .sort({ sentAt: -1 })
    .lean();
  const firstIn = await Message.findOne({ threadId, isIncoming: true })
    .sort({ sentAt: 1 })
    .lean();
  const firstOut = await Message.findOne({ threadId, isIncoming: false })
    .sort({ sentAt: 1 })
    .lean();
  const latest = await Message.findOne({ threadId }).sort({ sentAt: -1 }).lean();

  const labelNames = labelHints?.labelNames ?? thread.gmailLabelNames ?? [];
  const status = resolveStatusFromLabels(labelNames, { lastIn, lastOut });

  let replySeconds = thread.replyTimeSeconds;
  if (firstIn && firstOut && !replySeconds) {
    replySeconds = Math.round(
      (new Date(firstOut.sentAt) - new Date(firstIn.sentAt)) / 1000
    );
  }

  const prev = thread.status;
  thread.status = status;
  if (status === "done" && prev !== "done") {
    thread.closedAt = thread.closedAt || new Date();
  }
  if (status !== "done") {
    thread.closedAt = null;
  }

  if (firstIn?.sentAt && !thread.firstIncomingAt) thread.firstIncomingAt = firstIn.sentAt;
  if (firstOut?.sentAt && !thread.firstReplyAt) thread.firstReplyAt = firstOut.sentAt;
  thread.replyTimeSeconds = replySeconds;
  thread.latestMessageAt = latest?.sentAt || thread.latestMessageAt;

  const snippetSource =
    latest?.bodyText ||
    thread.snippet ||
    "";
  thread.snippet =
    normalizeBodyText(snippetSource, latest?.bodyHtml || "", thread.snippet || "").slice(
      0,
      160
    ) || thread.snippet;

  await thread.save();
  return status;
}

export async function upsertIncomingMessage(payload) {
  const sharedInbox =
    (await getSetting("shared_inbox_email")) || "support@company.com";
  const toEmails = payload.toEmails || [];
  const suffix =
    extractSuffix(toEmails, sharedInbox) || payload.detectedSuffix || null;

  const labelNames = payload.labelNames || [];
  const labelIds = payload.labelIds || [];
  const category =
    payload.category || detectCategory(labelNames) || null;
  const isNoise =
    payload.isNoise != null
      ? !!payload.isNoise
      : detectNoise({
          labelNames,
          fromEmail: payload.fromEmail,
          subject: payload.subject,
        });

  let thread = payload.threadExternalId
    ? await Thread.findOne({ externalId: payload.threadExternalId })
    : null;

  if (!thread && payload.subject) {
    const subject = payload.subject.startsWith("Re:")
      ? payload.subject.slice(4).trim()
      : payload.subject;
    thread = await Thread.findOne({ subject }).sort({ latestMessageAt: -1 });
  }

  const snippet =
    (payload.snippet || "").slice(0, 160) ||
    normalizeBodyText(payload.bodyText || "", payload.bodyHtml || "", "").slice(0, 160);

  if (!thread) {
    thread = await Thread.create({
      _id: nanoid(),
      externalId: payload.threadExternalId || `ext_${nanoid(8)}`,
      subject: payload.subject,
      snippet,
      participants: [payload.fromEmail, sharedInbox].filter(Boolean),
      status: "to_respond",
      category,
      isNoise,
      gmailLabelIds: labelIds,
      gmailLabelNames: labelNames,
      latestMessageAt: payload.sentAt || new Date(),
      firstIncomingAt: payload.sentAt || new Date(),
      unread: true,
    });
  } else {
    if (labelNames.length) {
      thread.gmailLabelNames = labelNames;
      thread.gmailLabelIds = labelIds;
    }
    if (category) thread.category = category;
    thread.isNoise = isNoise;
    if (snippet) thread.snippet = snippet;
    await thread.save();
  }

  if (suffix) {
    const tag = await ensureTag(suffix);
    if (tag && !thread.tagIds.includes(tag._id)) {
      thread.tagIds.push(tag._id);
      await thread.save();
    }
  }

  if (payload.externalId) {
    const existing = await Message.findOne({ externalId: payload.externalId }).lean();
    if (existing) {
      await recomputeThreadStatus(thread._id, { labelNames });
      return thread._id;
    }
  }

  const teamMember = await findTeamMemberByEmail(payload.fromEmail);
  const isIncoming = !teamMember;

  // SOP T5: do not persist full email bodies from sync — metadata + snippet only.
  // Portal-authored replies still store short body text (handled in reply route).
  const storeBodies = payload.persistBody === true;
  await Message.create({
    _id: nanoid(),
    threadId: thread._id,
    externalId: payload.externalId || `msg_${nanoid(8)}`,
    fromEmail: payload.fromEmail,
    fromName: payload.fromName || payload.fromEmail,
    toEmails,
    ccEmails: payload.ccEmails || [],
    bodyText: storeBodies ? payload.bodyText || "" : "",
    bodyHtml: storeBodies ? payload.bodyHtml || "" : "",
    sentAt: payload.sentAt || new Date(),
    isIncoming,
    repliedBy: teamMember?._id || null,
    detectedSuffix: suffix,
  });

  const participants = new Set(thread.participants || []);
  participants.add(payload.fromEmail);
  for (const e of toEmails) participants.add(e);
  thread.participants = [...participants];
  thread.unread = true;
  await thread.save();

  await recomputeThreadStatus(thread._id, { labelNames });
  return thread._id;
}

export async function setThreadStatus(threadId, status, { writeGmail = true } = {}) {
  const normalized = normalizeStatus(status);
  if (!STATUSES.includes(normalized)) throw new Error("Invalid status");

  const thread = await Thread.findById(threadId);
  if (!thread) throw new Error("Thread not found");

  const prev = thread.status;
  thread.status = normalized;
  if (normalized === "done") {
    thread.closedAt = thread.closedAt || new Date();
  } else {
    thread.closedAt = null;
  }
  await thread.save();

  if (writeGmail && thread.externalId && !String(thread.externalId).startsWith("ext_")) {
    try {
      const providerName = (await getSetting("provider")) || "demo";
      const provider = createProvider(providerName);
      if (typeof provider.applyStatusLabel === "function") {
        await provider.applyStatusLabel(thread.externalId, normalized);
      }
    } catch (err) {
      console.warn("[status] Gmail label write-back failed:", err.message);
    }
  }

  return { prev, status: normalized };
}

export async function checkUnansweredAlerts(io) {
  const days = Number((await getSetting("overdue_business_days")) || 2);
  const notify = (await getSetting("notify_unanswered")) !== "false";
  if (!notify) return [];

  const cutoff = businessDaysAgo(days);
  const unanswered = await Thread.find({
    status: "to_respond",
    isNoise: { $ne: true },
    firstIncomingAt: { $ne: null, $lte: cutoff },
  })
    .sort({ firstIncomingAt: 1 })
    .lean();

  const created = [];
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);

  for (const t of unanswered) {
    const exists = await Notification.findOne({
      threadId: t._id,
      type: "unanswered",
      createdAt: { $gte: dayAgo },
    }).lean();
    if (exists) continue;

    const title = `Overdue: ${days}+ business days`;
    const body = `"${t.subject}" still needs a response (To Respond)`;
    const n = await Notification.create({
      _id: nanoid(),
      type: "unanswered",
      title,
      body,
      threadId: t._id,
    });
    const payload = {
      id: n._id,
      type: "unanswered",
      title,
      body,
      threadId: t._id,
      read: false,
      createdAt: n.createdAt?.toISOString?.() || new Date().toISOString(),
    };
    created.push(payload);
    if (io) io.emit("notification", payload);
  }
  return created;
}

export async function enrichThreads(threads) {
  const list = Array.isArray(threads) ? threads : [];
  if (!list.length) return [];

  const tagIdSet = new Set();
  const assigneeIds = new Set();
  for (const t of list) {
    for (const id of t.tagIds || []) tagIdSet.add(id);
    if (t.assignedTo) assigneeIds.add(t.assignedTo);
  }

  const [tags, users, lastMsgs, sharedInbox, overdueDays] = await Promise.all([
    Tag.find({ _id: { $in: [...tagIdSet] } }).lean(),
    User.find({ _id: { $in: [...assigneeIds] } })
      .select("_id name email")
      .lean(),
    Message.find({
      threadId: { $in: list.map((t) => t._id) },
      isIncoming: false,
    })
      .sort({ sentAt: -1 })
      .lean(),
    getSetting("shared_inbox_email"),
    getSetting("overdue_business_days", "2"),
  ]);

  const tagMap = Object.fromEntries(tags.map((t) => [t._id, t]));
  const userMap = Object.fromEntries(users.map((u) => [u._id, u]));

  const lastByThread = {};
  const replierIds = new Set();
  for (const m of lastMsgs) {
    if (!lastByThread[m.threadId]) {
      lastByThread[m.threadId] = m;
      if (m.repliedBy) replierIds.add(m.repliedBy);
    }
  }
  const repliers = await User.find({ _id: { $in: [...replierIds] } })
    .select("_id name email")
    .lean();
  const replierMap = Object.fromEntries(repliers.map((u) => [u._id, u]));

  const { mapThread } = await import("./helpers.js");
  const opts = {
    sharedInboxEmail: sharedInbox || "",
    overdueBusinessDays: Number(overdueDays) || 2,
  };
  return list.map((t) => {
    const threadTags = (t.tagIds || []).map((id) => tagMap[id]).filter(Boolean);
    const last = lastByThread[t._id];
    const lastReplier = last?.repliedBy ? replierMap[last.repliedBy] : null;
    const assignee = t.assignedTo ? userMap[t.assignedTo] : null;
    return mapThread(t, threadTags, lastReplier, assignee, opts);
  });
}
