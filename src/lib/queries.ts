import "server-only";
import { prisma } from "./db";

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

/** Active catalog services, in display order. */
export async function getActiveServices() {
  return prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getServiceBySlug(slug: string) {
  return prisma.service.findUnique({ where: { slug } });
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
