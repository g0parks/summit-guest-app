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

/** "Mar 14" — for when the weekday is already said alongside. */
export function formatMonthDay(d: Date, tz = DEFAULT_TZ): string {
  const p = parts(d, tz);
  return `${p.month} ${p.day}`;
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

/** The zone's UTC offset in ms at a given instant ("GMT-06:00" → -6h). */
function tzOffsetMs(at: Date, timeZone: string): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0; // bare "GMT" = UTC
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3])) * 60 * 1000;
}

/**
 * Interpret a wall-clock date + time ("2026-01-15", "18:00") in an IANA
 * timezone and return the UTC instant. Servers run UTC (Vercel), so a naive
 * `new Date("YYYY-MM-DDTHH:mm")` stores the guest's "6:00 PM" as 18:00 UTC —
 * this is the dependency-free fix: build the UTC guess, read the zone's
 * offset at that instant, adjust, and re-check once for DST edges.
 * Malformed input → Invalid Date (caller checks `Number.isNaN(d.getTime())`).
 */
export function zonedDateTime(dateStr: string, timeStr: string, timeZone: string): Date {
  const dm = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  // Time inputs legally submit "HH:mm:ss" when seconds are nonzero — accept
  // and ignore the seconds rather than silently dropping the whole timestamp.
  const tm = timeStr.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!dm || !tm) return new Date(NaN);
  const utcGuess = Date.UTC(
    Number(dm[1]),
    Number(dm[2]) - 1,
    Number(dm[3]),
    Number(tm[1]),
    Number(tm[2]),
  );
  const offset = tzOffsetMs(new Date(utcGuess), timeZone);
  const adjusted = utcGuess - offset;
  // Offset may differ across a DST transition — trust the adjusted instant's.
  const offsetAfter = tzOffsetMs(new Date(adjusted), timeZone);
  return new Date(offsetAfter === offset ? adjusted : utcGuess - offsetAfter);
}

/** "18:00" in the given tz — value for <input type="time">. */
export function timeValue(d: Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(d);
}

/** "MST" / "MDT" — short zone label so ops times read unambiguously. */
export function tzAbbr(d: Date, tz = DEFAULT_TZ): string {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? tz
  );
}
