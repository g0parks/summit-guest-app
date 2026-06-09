import "server-only";
import { prisma } from "./db";

/** Data for the trip-home hub: the next upcoming itinerary item + tab total. */
export async function getTripHome(stayId: string) {
  const now = new Date();
  const [nextUp, tab] = await Promise.all([
    prisma.itineraryItem.findFirst({
      where: { stayId, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.tabLineItem.aggregate({
      where: { stayId, status: { in: ["PENDING", "CHARGED"] } },
      _sum: { amount: true },
    }),
  ]);
  return { nextUp, tabTotalCents: tab._sum.amount ?? 0 };
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
