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

// L1 essentials lead (TRANSPORT / ACTIVITY+experiences / PROVISIONING); the
// elevated L2 (WELLNESS / DINING) and on-request (OTHER) fall below the fold.
export const CATEGORY_ORDER: ServiceCategory[] = [
  "TRANSPORT",
  "ACTIVITY",
  "PROVISIONING",
  "WELLNESS",
  "DINING",
  "HOUSEHOLD",
  "OTHER",
];

/** A fixed-price service auto-confirms; a QUOTE service waits for pricing. */
export function isFixedPrice(unit: PriceUnit, amount: number | null): amount is number {
  return unit !== "QUOTE" && amount != null;
}

/** Charge for an auto-confirmed request (per-person scales by party size). */
export function computeChargeCents(
  unit: PriceUnit,
  amountCents: number,
  partySize: number,
): number {
  return unit === "PER_PERSON" ? amountCents * Math.max(1, partySize) : amountCents;
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
    location: "In-residence",
    category: serviceToItineraryCategory(input.service.category),
    startsAt: input.startsAt,
  };
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
