/**
 * Business-day helpers for SOP SLA (skip Sat/Sun; no holiday calendar).
 */

export function businessDaysBetween(from, to = new Date()) {
  if (!from) return null;
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end < start) return 0;

  // Normalize to local midnights
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  let days = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days += 1;
  }
  return days;
}

/** Cutoff date: N business days before `to` (walk backwards). */
export function businessDaysAgo(n, to = new Date()) {
  const d = new Date(to);
  d.setHours(0, 0, 0, 0);
  let left = Math.max(0, Number(n) || 0);
  while (left > 0) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return d;
}
