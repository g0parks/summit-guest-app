/**
 * Date formatting in the property's timezone. Itinerary timestamps are stored
 * as timestamptz; we always render them in the property's local tz.
 */

const DEFAULT_TZ = "America/Denver";

function parts(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: tz,
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    p.find((x) => x.type === t)?.value ?? "";
  return {
    weekday: get("weekday"),
    month: get("month"),
    day: get("day"),
    year: get("year"),
  };
}

/** "Mar 14 – 18" within a month, "Mar 28 – Apr 2" across months. */
export function formatDateRange(start: Date, end: Date, tz = DEFAULT_TZ): string {
  const s = parts(start, tz);
  const e = parts(end, tz);
  if (s.month === e.month && s.year === e.year) {
    return `${s.month} ${s.day} – ${e.day}`;
  }
  return `${s.month} ${s.day} – ${e.month} ${e.day}`;
}

/** Stable per-day key in the given tz ("2026-06-08"), for grouping. */
export function dayKey(d: Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(d);
}

/** "Sat, Mar 14" */
export function formatDayLabel(d: Date, tz = DEFAULT_TZ): string {
  const p = parts(d, tz);
  return `${p.weekday}, ${p.month} ${p.day}`;
}

/** "7:00 PM" */
export function formatTime(d: Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(d);
}

/**
 * Friendly relative day word for the itinerary "next up" moment:
 * "Today" / "Tomorrow" / weekday name, compared in the property tz.
 */
export function relativeDayWord(d: Date, tz = DEFAULT_TZ): string {
  const dayKey = (x: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: tz,
    }).format(x);
  const target = dayKey(d);
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  if (target === today) return "Today";
  if (target === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz }).format(d);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}
