import { formatDistanceToNow, format, formatDuration, intervalToDuration } from "date-fns";

export function relativeTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return format(new Date(iso), "MMM d, yyyy · h:mm a");
}

export function formatReplyTime(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  if (seconds < 3600) {
    return formatDuration(duration, { format: ["minutes"] }) || "< 1 min";
  }
  if (seconds < 86400) {
    return formatDuration(duration, { format: ["hours", "minutes"] });
  }
  return formatDuration(duration, { format: ["days", "hours"] });
}

export function senderFromParticipants(
  participants: string[],
  sharedDomains = ["company.com", "gatpsolutions.com"]
) {
  return (
    participants.find((p) => {
      const domain = p.split("@")[1]?.toLowerCase() || "";
      return domain && !sharedDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
    }) ||
    participants[0] ||
    "Unknown"
  );
}

export function domainFromEmail(email: string) {
  const part = email.includes("@") ? email.split("@")[1] : email;
  return (part || "").toLowerCase();
}
