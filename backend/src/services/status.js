/** SOP status + noise/category helpers for accounting inbox. */

export const STATUSES = ["to_respond", "waiting", "done"];

export const STATUS_GMAIL_LABELS = {
  to_respond: "To Respond",
  waiting: "Waiting On Them",
  done: "Done",
};

export const NOISE_LABELS = [
  "OTP-Auto",
  "Promotions",
  "Notification",
  "Meetings & Events",
];

export const CATEGORY_LABELS = [
  "Bills / AP",
  "Payroll",
  "Tax",
  "Bank & Reconciliation",
  "Client Query",
  "Notification",
  "Promotions",
];

/** Map legacy portal statuses → SOP. */
export const LEGACY_STATUS_MAP = {
  not_replied: "to_respond",
  needs_followup: "to_respond",
  replied: "waiting",
  replied_by_other: "waiting",
  to_respond: "to_respond",
  waiting: "waiting",
  done: "done",
};

const NOISE_SENDER_RE =
  /otp|one[\s-]?time|verification code|paypal|afterpay|zeal|mercury|amerisource|mckesson|pharmaforce|fluidpay|maverick|stripe|fireflies|tactiq|read\.?ai|quickbooks time|turo|onedrive|zoom\.us/i;

export function normalizeStatus(status) {
  if (!status) return null;
  return LEGACY_STATUS_MAP[status] || (STATUSES.includes(status) ? status : null);
}

/** Prefer Gmail status label names; else derive from last in/out. */
export function resolveStatusFromLabels(labelNames = [], { lastIn, lastOut } = {}) {
  const names = labelNames.map((n) => String(n).trim().toLowerCase());
  if (names.some((n) => n === "done" || n.includes("✅"))) return "done";
  if (
    names.some(
      (n) =>
        n === "waiting on them" ||
        n.includes("waiting on them") ||
        n === "🟡 waiting on them"
    )
  ) {
    return "waiting";
  }
  if (
    names.some(
      (n) =>
        n === "to respond" ||
        n.includes("to respond") ||
        n === "🔴 to respond"
    )
  ) {
    return "to_respond";
  }

  if (!lastOut) return "to_respond";
  if (lastIn && new Date(lastIn.sentAt) > new Date(lastOut.sentAt)) return "to_respond";
  return "waiting";
}

export function detectCategory(labelNames = []) {
  const lower = labelNames.map((n) => String(n).toLowerCase());
  for (const cat of CATEGORY_LABELS) {
    const key = cat.toLowerCase();
    if (lower.some((n) => n === key || n.includes(key.split(" / ")[0]) || n.includes(key))) {
      return cat;
    }
  }
  // loose matches
  if (lower.some((n) => /bill|ap\b|accounts payable/.test(n))) return "Bills / AP";
  if (lower.some((n) => /payroll/.test(n))) return "Payroll";
  if (lower.some((n) => /\btax\b/.test(n))) return "Tax";
  if (lower.some((n) => /bank|reconcil/.test(n))) return "Bank & Reconciliation";
  if (lower.some((n) => /query|client/.test(n))) return "Client Query";
  return null;
}

export function detectNoise({ labelNames = [], fromEmail = "", subject = "" } = {}) {
  const lower = labelNames.map((n) => String(n).toLowerCase());
  if (
    lower.some((n) =>
      NOISE_LABELS.some((nl) => n === nl.toLowerCase() || n.includes(nl.toLowerCase()))
    )
  ) {
    return true;
  }
  const hay = `${fromEmail} ${subject}`;
  return NOISE_SENDER_RE.test(hay);
}

export function ageBucketFromBusinessDays(days) {
  if (days == null || Number.isNaN(days)) return null;
  if (days <= 1) return "0-1";
  if (days <= 3) return "2-3";
  return "4+";
}
