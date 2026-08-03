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

/** SOP status taxonomy */
export type ThreadStatus = "to_respond" | "waiting" | "done";

export type Thread = {
  id: string;
  externalId?: string;
  subject: string;
  snippet: string;
  participants: string[];
  status: ThreadStatus;
  category: string | null;
  isNoise: boolean;
  closedAt: string | null;
  assignedTo: User | null;
  tags: Tag[];
  latestMessageAt: string;
  firstIncomingAt: string | null;
  firstReplyAt: string | null;
  replyTimeSeconds: number | null;
  unread: boolean;
  lastReplier: User | null;
  unansweredHours: number | null;
  ageBusinessDays: number | null;
  ageBucket: "0-1" | "2-3" | "4+" | null;
  gmailUrl: string | null;
  overdue?: boolean;
};

export type Message = {
  id: string;
  threadId: string;
  externalId?: string;
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
  open: number;
  toRespond: number;
  waiting: number;
  done: number;
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
    toRespond?: number;
    waiting?: number;
    open?: number;
    repliedPercent: number;
  }[];
  byStatus: Record<string, number>;
  oldestUnanswered: Thread | null;
  overdueCount: number;
  overdue: number;
  closedThisWeek: number;
  unfiled: number;
  noiseCount: number;
  trend: { date: string; opened: number; closed: number }[];
  thresholdHours: number;
  overdueBusinessDays: number;
};

export type LeaderboardEntry = {
  user: User;
  replies: number;
  assignedOpen: number;
  avgReplyTimeSeconds: number | null;
};

export const STATUS_LABELS: Record<ThreadStatus, string> = {
  to_respond: "To Respond",
  waiting: "Waiting On Them",
  done: "Done",
};

export const CATEGORY_OPTIONS = [
  "Bills / AP",
  "Payroll",
  "Tax",
  "Bank & Reconciliation",
  "Client Query",
  "Notification",
  "Promotions",
] as const;
