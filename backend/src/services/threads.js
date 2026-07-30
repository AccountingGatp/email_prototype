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

export async function recomputeThreadStatus(threadId) {
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

  let status = "not_replied";
  if (!lastOut) {
    status = "not_replied";
  } else if (lastIn && new Date(lastIn.sentAt) > new Date(lastOut.sentAt)) {
    status = "needs_followup";
  } else if (
    thread.assignedTo &&
    lastOut.repliedBy &&
    lastOut.repliedBy !== thread.assignedTo
  ) {
    status = "replied_by_other";
  } else {
    status = "replied";
  }

  let replySeconds = thread.replyTimeSeconds;
  if (firstIn && firstOut && !replySeconds) {
    replySeconds = Math.round(
      (new Date(firstOut.sentAt) - new Date(firstIn.sentAt)) / 1000
    );
  }

  thread.status = status;
  if (firstIn?.sentAt && !thread.firstIncomingAt) thread.firstIncomingAt = firstIn.sentAt;
  if (firstOut?.sentAt && !thread.firstReplyAt) thread.firstReplyAt = firstOut.sentAt;
  thread.replyTimeSeconds = replySeconds;
  thread.latestMessageAt = latest?.sentAt || thread.latestMessageAt;
  thread.snippet = latest?.bodyText?.slice(0, 120) || thread.snippet;
  await thread.save();
  return status;
}

export async function upsertIncomingMessage(payload) {
  const sharedInbox =
    (await getSetting("shared_inbox_email")) || "support@company.com";
  const toEmails = payload.toEmails || [];
  const suffix =
    extractSuffix(toEmails, sharedInbox) || payload.detectedSuffix || null;

  let thread = payload.threadExternalId
    ? await Thread.findOne({ externalId: payload.threadExternalId })
    : null;

  if (!thread && payload.subject) {
    const subject = payload.subject.startsWith("Re:")
      ? payload.subject.slice(4).trim()
      : payload.subject;
    thread = await Thread.findOne({ subject }).sort({ latestMessageAt: -1 });
  }

  if (!thread) {
    thread = await Thread.create({
      _id: nanoid(),
      externalId: payload.threadExternalId || `ext_${nanoid(8)}`,
      subject: payload.subject,
      snippet: (payload.bodyText || "").slice(0, 120),
      participants: [payload.fromEmail, sharedInbox].filter(Boolean),
      status: "not_replied",
      latestMessageAt: payload.sentAt || new Date(),
      firstIncomingAt: payload.sentAt || new Date(),
      unread: true,
    });
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
    if (existing) return thread._id;
  }

  const teamMember = await findTeamMemberByEmail(payload.fromEmail);
  const isIncoming = !teamMember;

  await Message.create({
    _id: nanoid(),
    threadId: thread._id,
    externalId: payload.externalId || `msg_${nanoid(8)}`,
    fromEmail: payload.fromEmail,
    fromName: payload.fromName || payload.fromEmail,
    toEmails,
    ccEmails: payload.ccEmails || [],
    bodyText: payload.bodyText || "",
    bodyHtml: payload.bodyHtml || "",
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

  await recomputeThreadStatus(thread._id);
  return thread._id;
}

export async function checkUnansweredAlerts(io) {
  const hours = Number((await getSetting("unanswered_threshold_hours")) || 4);
  const notify = (await getSetting("notify_unanswered")) !== "false";
  if (!notify) return [];

  const cutoff = new Date(Date.now() - hours * 3600 * 1000);
  const unanswered = await Thread.find({
    status: "not_replied",
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

    const title = `Unanswered for ${hours}+ hours`;
    const body = `"${t.subject}" has had no reply since ${t.firstIncomingAt}`;
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

  const [tags, users, lastMsgs] = await Promise.all([
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
  return list.map((t) => {
    const threadTags = (t.tagIds || []).map((id) => tagMap[id]).filter(Boolean);
    const last = lastByThread[t._id];
    const lastReplier = last?.repliedBy ? replierMap[last.repliedBy] : null;
    const assignee = t.assignedTo ? userMap[t.assignedTo] : null;
    return mapThread(t, threadTags, lastReplier, assignee);
  });
}
