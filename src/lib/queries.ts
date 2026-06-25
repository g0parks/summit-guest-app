import "server-only";
import type { Season } from "@prisma/client";
import { prisma } from "./db";
import { getStayPhase } from "./stayPhase";

/** Request statuses the guest still has a move on (wizard / approval). */
export const OPEN_REQUEST_STATUSES = ["SIGNALED", "READY", "QUOTED"] as const;

/** Perks visible to a stay: active, global or scoped to its property's partner. */
function perkVisibilityWhere(partnerId: string | null) {
  return {
    isActive: true,
    OR: [{ partnerId: null }, ...(partnerId ? [{ partnerId }] : [])],
  };
}

/**
 * Data for the trip-home hub: next itinerary item and the first perk this
 * stay hasn't claimed yet (the pre-arrival gift-card hook). Tab totals live
 * on the tab page only.
 */
export async function getTripHome(stayId: string, partnerId: string | null) {
  const now = new Date();
  const [nextUp, unclaimedPerk] = await Promise.all([
    prisma.itineraryItem.findFirst({
      where: { stayId, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.perk.findFirst({
      where: { ...perkVisibilityWhere(partnerId), claims: { none: { stayId } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  return { nextUp, unclaimedPerk };
}

/** Perk Bank list: visible perks + this stay's claim (for the quiet "Claimed" state). */
export async function getPerksForStay(stayId: string, partnerId: string | null) {
  return prisma.perk.findMany({
    where: perkVisibilityWhere(partnerId),
    include: { claims: { where: { stayId } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** One perk by slug, with this stay's claim if any. */
export async function getPerkBySlug(slug: string, stayId: string) {
  return prisma.perk.findUnique({
    where: { slug },
    include: { claims: { where: { stayId } } },
  });
}

/** All itinerary items for a stay, in chronological order. */
export async function getItinerary(stayId: string) {
  return prisma.itineraryItem.findMany({
    where: { stayId },
    orderBy: [{ startsAt: "asc" }, { sortOrder: "asc" }],
  });
}

/**
 * One itinerary item for the structured-change page — must belong to the
 * stay. The linked service's cutoffs decide which change options render;
 * open change rows mean "already being rearranged".
 */
export async function getItineraryItemForChange(stayId: string, itemId: string) {
  const item = await prisma.itineraryItem.findUnique({
    where: { id: itemId },
    include: {
      serviceRequest: { include: { service: true } },
      changeRequests: { where: { status: "OPEN" } },
    },
  });
  if (!item || item.stayId !== stayId) return null;
  return item;
}

/**
 * Active catalog services for a stay, in display order. The stay's season
 * picks the menu (Product Doctrine): off-season dishes are hidden entirely,
 * never greyed out. No season → the full menu (ops/utility contexts).
 */
export async function getActiveServices(season?: Season) {
  return prisma.service.findMany({
    where: {
      isActive: true,
      ...(season ? { season: { in: [season, "ALL_YEAR"] } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** One request for the guided wizard — must belong to the stay. */
export async function getRequestForWizard(stayId: string, requestId: string) {
  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { service: true },
  });
  if (!request || request.stayId !== stayId) return null;
  return request;
}

/**
 * The stay's open requests — the pre-arrival checklist / resumption surface.
 * SIGNALED resumes the wizard; READY/QUOTED show "being arranged" states.
 */
export async function getOpenRequests(stayId: string) {
  return prisma.serviceRequest.findMany({
    where: { stayId, status: { in: [...OPEN_REQUEST_STATUSES] } },
    include: { service: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getServiceBySlug(slug: string) {
  // isActive guard so a deactivated service (e.g. alcohol, pulled for Utah law)
  // can't be booked via its direct URL even though it's gone from the catalog.
  return prisma.service.findFirst({ where: { slug, isActive: true } });
}

/**
 * Trip-derived seeds for the bar's discovery (Alcohol spec) — the read-only
 * visibility inputs that decide WHICH moments surface, never pre-filling the
 * order. Today there's one: `phase` hides the "arrival" moment once the guest
 * is in-house ("when you walk in" has passed). Computed identically wherever
 * the bar flow is evaluated (the wizard page + the save action) so client and
 * server agree. Pure — no DB; lives here as the single seed definition.
 */
export function getBarSeeds(
  stay: { arrivalDate: Date; departureDate: Date },
  timezone: string,
): Record<string, string> {
  return { phase: getStayPhase(stay, timezone) };
}

/** Running tab: line items, card(s) on file, and pending/charged totals. */
export async function getTab(stayId: string) {
  const [items, cards] = await Promise.all([
    prisma.tabLineItem.findMany({
      // VOID = declined/cancelled before charge — never guest-visible.
      where: { stayId, status: { not: "VOID" } },
      orderBy: { occurredAt: "desc" },
    }),
    prisma.paymentMethod.findMany({
      where: { stayId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const pending = items
    .filter((i) => i.status === "PENDING")
    .reduce((sum, i) => sum + i.amount, 0);
  const charged = items
    .filter((i) => i.status === "CHARGED")
    .reduce((sum, i) => sum + i.amount, 0);
  const defaultCard = cards.find((c) => c.isDefault) ?? cards[0] ?? null;

  return { items, cards, defaultCard, pending, charged, total: pending + charged };
}
