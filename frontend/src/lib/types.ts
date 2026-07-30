export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
  description?: string | null;
  threadCount?: number;
  createdAt?: string;
};

export type ThreadStatus =
  | "replied"
  | "not_replied"
  | "replied_by_other"
  | "needs_followup";

export type Thread = {
  id: string;
  externalId?: string;
  subject: string;
  snippet: string;
  participants: string[];
  status: ThreadStatus;
  assignedTo: User | null;
  tags: Tag[];
  latestMessageAt: string;
  firstIncomingAt: string | null;
  firstReplyAt: string | null;
  replyTimeSeconds: number | null;
  unread: boolean;
  lastReplier: User | null;
  unansweredHours: number | null;
};

export type Message = {
  id: string;
  threadId: string;
  fromEmail: string;
  fromName: string;
  toEmails: string[];
  bodyText: string;
  bodyHtml: string;
  sentAt: string;
  isIncoming: boolean;
  repliedBy: User | null;
  detectedSuffix: string | null;
};

export type Overview = {
  totalToday: number;
  totalWeek: number;
  total: number;
  replied: number;
  notReplied: number;
  repliedPercent: number;
  notRepliedPercent: number;
  avgReplyTimeSeconds: number | null;
  byTag: { id: string; name: string; color: string; count: number; percent?: number }[];
  byClient: {
    id: string;
    name: string;
    domain: string;
    color: string;
    count: number;
    percent: number;
    replied: number;
    notReplied: number;
    repliedPercent: number;
  }[];
  byStatus: Record<string, number>;
  oldestUnanswered: Thread | null;
  overdueCount: number;
  thresholdHours: number;
};

export type LeaderboardEntry = {
  user: User;
  replies: number;
  assignedOpen: number;
  avgReplyTimeSeconds: number | null;
};

export const STATUS_LABELS: Record<ThreadStatus, string> = {
  replied: "Replied",
  not_replied: "Not replied",
  replied_by_other: "Replied by someone else",
  needs_followup: "Needs follow-up",
};
