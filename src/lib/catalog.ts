import type { ServiceCategory, ItineraryCategory, PriceUnit } from "@prisma/client";

/** Display labels + order for catalog category sections. */
export const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  DINING: "Dining",
  ACTIVITY: "On the mountain",
  WELLNESS: "Wellness",
  TRANSPORT: "Transport",
  PROVISIONING: "Provisioning",
  HOUSEHOLD: "Household",
  OTHER: "More",
};

// The two heroes lead (TRANSPORT #1, PROVISIONING #2) — the universal front
// doors that carry both PC seasons; the seasonal hero (ski/bike ACTIVITY) is
// #3. The elevated L2 (WELLNESS / DINING) and on-request (OTHER) fall below.
export const CATEGORY_ORDER: ServiceCategory[] = [
  "TRANSPORT",
  "PROVISIONING",
  "ACTIVITY",
  "WELLNESS",
  "DINING",
  "HOUSEHOLD",
  "OTHER",
];

/**
 * A fixed-price service auto-confirms; QUOTE waits for pricing and
 * FEE_STRUCTURE (grocery + bar) is priced by the operator after the guest
 * consents to the disclosed schedule — neither is fixed-price.
 */
export function isFixedPrice(unit: PriceUnit, amount: number | null): amount is number {
  return unit !== "QUOTE" && unit !== "FEE_STRUCTURE" && amount != null;
}

/**
 * The transfer direction that bills two legs. The vendor charges per movement
 * (Snow Country: $275 each way), so a round trip is two fares - keeping this
 * as the literal wizard option value means the answer IS the price input.
 */
export const ROUND_TRIP = "Round trip";

/**
 * How many vendor legs a request bills. Only transfers can be >1 today: a
 * round trip is two separate drives on two dates, each costing us a full net
 * fare. Anything without a `direction` answer bills one leg.
 */
export function transferLegs(answers: Record<string, string>): number {
  return answers.direction?.trim() === ROUND_TRIP ? 2 : 1;
}

/**
 * Charge for an auto-confirmed request. PER_PERSON scales by party size;
 * `legs` scales by vendor movements (round-trip transfers). Both multiply -
 * a per-person service with two legs would bill both, which is correct.
 */
export function computeChargeCents(
  unit: PriceUnit,
  amountCents: number,
  partySize: number,
  legs = 1,
): number {
  const base = unit === "PER_PERSON" ? amountCents * Math.max(1, partySize) : amountCents;
  return base * Math.max(1, legs);
}

/**
 * Itinerary payload for a confirmed, dated request — shared by the guest
 * auto-confirm path (requests.ts) and the ops quote path (ops.ts) so a
 * concierge-priced request surfaces exactly like an auto-confirmed one.
 */
export function confirmedRequestItineraryData(input: {
  stayId: string;
  requestId: string;
  service: { name: string; shortDesc: string; category: ServiceCategory };
  notes: string | null;
  startsAt: Date;
}) {
  return {
    stayId: input.stayId,
    serviceRequestId: input.requestId,
    title: input.service.name,
    description: input.notes ?? input.service.shortDesc,
    // Only claim "In-residence" for categories that actually happen there —
    // a transfer tagged "In-residence" reads wrong, and activities (guided
    // fly-fishing) happen out in the world. Null just omits the tag.
    location: inResidenceCategory(input.service.category) ? "In-residence" : null,
    category: serviceToItineraryCategory(input.service.category),
    startsAt: input.startsAt,
  };
}

/** Categories whose services are delivered in the residence itself. */
function inResidenceCategory(c: ServiceCategory): boolean {
  return c !== "TRANSPORT" && c !== "ACTIVITY";
}

/** When a request is confirmed, surface it on the itinerary under this category. */
export function serviceToItineraryCategory(c: ServiceCategory): ItineraryCategory {
  switch (c) {
    case "DINING":
      return "DINING";
    case "TRANSPORT":
      return "TRANSPORT";
    case "ACTIVITY":
      return "ACTIVITY";
    case "WELLNESS":
      return "WELLNESS";
    default:
      return "NOTE";
  }
}
