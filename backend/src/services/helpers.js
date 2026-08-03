/**
 * Parse plus-addressing suffix from recipient addresses.
 * e.g. support+billing@company.com → "billing"
 */
import { normalizeBodyText } from "./email-body.js";
import { businessDaysBetween } from "./sla.js";
import { normalizeStatus, ageBucketFromBusinessDays } from "./status.js";

export function extractSuffix(toEmails = [], sharedInbox = "support@company.com") {
  const localBase = sharedInbox.split("@")[0].toLowerCase();
  const domain = sharedInbox.split("@")[1]?.toLowerCase();

  for (const raw of toEmails) {
    const email = String(raw).toLowerCase().trim();
    const match = email.match(/^([^@+]+)\+([^@]+)@(.+)$/);
    if (!match) continue;
    const [, local, suffix, emailDomain] = match;
    if (local === localBase && (!domain || emailDomain === domain)) {
      return suffix;
    }
  }
  return null;
}

export function hoursBetween(a, b) {
  return (new Date(b) - new Date(a)) / 3600000;
}

function iso(d) {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export function mapThread(thread, tags = [], lastReplier = null, assignee = null, opts = {}) {
  const assigned =
    assignee ||
    (thread.assignedTo && typeof thread.assignedTo === "object"
      ? thread.assignedTo
      : null);

  const snippet = normalizeBodyText(thread.snippet || "", "", "").slice(0, 160);
  const status = normalizeStatus(thread.status) || thread.status;
  const ageBusinessDays =
    thread.firstIncomingAt && status === "to_respond"
      ? businessDaysBetween(thread.firstIncomingAt, new Date())
      : thread.firstIncomingAt
        ? businessDaysBetween(thread.firstIncomingAt, new Date())
        : null;
  const ageBucketVal = ageBucketFromBusinessDays(ageBusinessDays);
  const mailbox = opts.sharedInboxEmail || "";
  const gmailUrl =
    thread.externalId && !String(thread.externalId).startsWith("ext_")
      ? mailbox
        ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#all/${thread.externalId}`
        : `https://mail.google.com/mail/u/0/#all/${thread.externalId}`
      : null;

  return {
    id: thread._id,
    externalId: thread.externalId,
    subject: thread.subject,
    snippet,
    participants: thread.participants || [],
    status,
    category: thread.category || null,
    isNoise: !!thread.isNoise,
    closedAt: iso(thread.closedAt),
    assignedTo: assigned
      ? { id: assigned._id || assigned.id, name: assigned.name, email: assigned.email }
      : null,
    tags: tags.map((t) => ({
      id: t._id || t.id,
      name: t.name,
      color: t.color,
    })),
    latestMessageAt: iso(thread.latestMessageAt),
    firstIncomingAt: iso(thread.firstIncomingAt),
    firstReplyAt: iso(thread.firstReplyAt),
    replyTimeSeconds: thread.replyTimeSeconds,
    unread: !!thread.unread,
    createdAt: iso(thread.createdAt),
    updatedAt: iso(thread.updatedAt),
    lastReplier: lastReplier
      ? {
          id: lastReplier._id || lastReplier.id,
          name: lastReplier.name,
          email: lastReplier.email,
        }
      : null,
    ageBusinessDays,
    ageBucket: ageBucketVal,
    gmailUrl,
    unansweredHours:
      thread.firstIncomingAt && status === "to_respond"
        ? hoursBetween(thread.firstIncomingAt, new Date())
        : null,
    overdue:
      status === "to_respond" &&
      ageBusinessDays != null &&
      ageBusinessDays > (opts.overdueBusinessDays ?? 2),
  };
}

export function mapMessage(msg, replier = null) {
  const repliedBy =
    replier ||
    (msg.repliedBy && typeof msg.repliedBy === "object" ? msg.repliedBy : null);

  const bodyText = normalizeBodyText(msg.bodyText || "", msg.bodyHtml || "", "");

  return {
    id: msg._id,
    threadId: msg.threadId,
    externalId: msg.externalId,
    fromEmail: msg.fromEmail,
    fromName: msg.fromName,
    toEmails: msg.toEmails || [],
    ccEmails: msg.ccEmails || [],
    bodyText,
    bodyHtml: msg.bodyHtml || "",
    sentAt: iso(msg.sentAt),
    isIncoming: !!msg.isIncoming,
    repliedBy: repliedBy
      ? { id: repliedBy._id || repliedBy.id, name: repliedBy.name, email: repliedBy.email }
      : null,
    detectedSuffix: msg.detectedSuffix,
  };
}
