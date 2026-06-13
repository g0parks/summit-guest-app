// NOTE: pure date math, no `server-only` (the tokens.ts precedent) — scripts
// and client components may both need to reason about phase.
import { dayKey } from "./dates";

/**
 * The stay lifecycle, DERIVED from dates — never stored. `Stay.status` is
 * write-only legacy display; this module is the single source of truth for
 * "where in the journey is this guest?".
 *
 * Day-granular and property-tz-correct: arrival and departure days both count
 * as IN_STAY (the guest is at the property for part of each), compared via
 * dayKey strings in the property's timezone.
 */

export type StayPhase = "PRE_ARRIVAL" | "IN_STAY" | "POST_STAY";

/** Post-departure access window — session cookie AND minted-token expiry. */
export const POST_STAY_ACCESS_DAYS = 30;

type StayDates = { arrivalDate: Date; departureDate: Date };

export function getStayPhase(
  stay: StayDates,
  timezone: string,
  now = new Date(),
): StayPhase {
  const today = dayKey(now, timezone);
  if (today < dayKey(stay.arrivalDate, timezone)) return "PRE_ARRIVAL";
  if (today > dayKey(stay.departureDate, timezone)) return "POST_STAY";
  return "IN_STAY";
}

/**
 * Park City runs two menus (Product Doctrine 2026-06-12): Nov–Apr = WINTER,
 * May–Oct = SUMMER. Anonymous surfaces (/plan World B) season off today's
 * date — Park City time, since that's where the trip lands.
 */
export function seasonForDate(
  d: Date,
  timezone = "America/Denver",
): "WINTER" | "SUMMER" {
  // dayKey is "YYYY-MM-DD" in the property tz — month is chars 5–6.
  const month = Number(dayKey(d, timezone).slice(5, 7));
  return month >= 11 || month <= 4 ? "WINTER" : "SUMMER";
}

/**
 * The stay's season, DERIVED from arrival month in the property tz.
 * Stay dates pick what the catalog shows; ALL_YEAR services render in both.
 */
export function staySeason(stay: StayDates, timezone: string): "WINTER" | "SUMMER" {
  return seasonForDate(stay.arrivalDate, timezone);
}

/**
 * Whole days until arrival day in the property tz (0 = arriving today,
 * 1 = tomorrow). Compares calendar days, not 24h blocks — "tomorrow" is
 * tomorrow even at 11 PM tonight.
 */
export function daysUntilArrival(
  stay: StayDates,
  timezone: string,
  now = new Date(),
): number {
  const DAY = 24 * 60 * 60 * 1000;
  // Walk forward in 24h steps until the day key matches — DST-safe because
  // each step re-reads the calendar day in the property tz.
  const target = dayKey(stay.arrivalDate, timezone);
  for (let i = 0; i <= 366; i++) {
    if (dayKey(new Date(now.getTime() + i * DAY), timezone) === target) return i;
  }
  // Arrival further than a year out — round trip-day distance is plenty.
  return Math.round((stay.arrivalDate.getTime() - now.getTime()) / DAY);
}
