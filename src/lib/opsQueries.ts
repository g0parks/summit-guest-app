import "server-only";
import { prisma } from "./db";

/**
 * Ops-console queries ONLY. `queries.ts` stays guest-only so it's obvious
 * which surface sees what — these results carry internal economics fields
 * (vendorCostCents / pmShareCents / netCents) that must never reach a
 * guest-facing page.
 */

const HOUR = 60 * 60 * 1000;

/**
 * "Needs action" queue: unquoted requests first (price them), then confirmed
 * requests being delivered in the next 48h, then perk claims waiting to be
 * arranged (status CLAIMED).
 */
export async function getNeedsAction() {
  const now = new Date();
  const include = {
    service: true,
    stay: { include: { guest: true, property: true } },
  } as const;

  const [needsQuote, upcoming, perkClaims] = await Promise.all([
    prisma.serviceRequest.findMany({
      where: { status: "REQUESTED" },
      include,
      orderBy: { createdAt: "asc" },
    }),
    prisma.serviceRequest.findMany({
      where: {
        status: "CONFIRMED",
        requestedFor: { gte: now, lte: new Date(now.getTime() + 48 * HOUR) },
      },
      include,
      orderBy: { requestedFor: "asc" },
    }),
    prisma.perkClaim.findMany({
      where: { status: "CLAIMED" },
      include: { perk: true, stay: { include: { guest: true, property: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return { needsQuote, upcoming, perkClaims };
}

/** Upcoming + in-house stays with tab totals and the engagement signal. */
export async function getOpsStays() {
  const stays = await prisma.stay.findMany({
    where: { departureDate: { gte: new Date() } },
    include: {
      guest: true,
      property: true,
      accessTokens: true,
      tabLineItems: true,
    },
    orderBy: { arrivalDate: "asc" },
  });

  return stays.map((s) => {
    const pendingCents = s.tabLineItems
      .filter((l) => l.status === "PENDING")
      .reduce((sum, l) => sum + l.amount, 0);
    const chargedCents = s.tabLineItems
      .filter((l) => l.status === "CHARGED")
      .reduce((sum, l) => sum + l.amount, 0);
    const lastAccessedAt = s.accessTokens.reduce<Date | null>(
      (latest, t) =>
        t.lastAccessedAt && (!latest || t.lastAccessedAt > latest)
          ? t.lastAccessedAt
          : latest,
      null,
    );
    return { ...s, pendingCents, chargedCents, lastAccessedAt };
  });
}

/**
 * Departed in the last 14 days with PENDING tab lines — unsettled money that
 * used to vanish when the stays table filtered to departureDate >= now.
 * The close-out action is the existing ChargeButton on stay detail.
 */
export async function getRecentlyDeparted() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 14 * 24 * HOUR);
  const stays = await prisma.stay.findMany({
    where: {
      departureDate: { lt: now, gte: cutoff },
      tabLineItems: { some: { status: "PENDING" } },
    },
    include: {
      guest: true,
      property: true,
      tabLineItems: { where: { status: "PENDING" } },
    },
    orderBy: { departureDate: "desc" },
  });

  return stays.map((s) => ({
    ...s,
    pendingCents: s.tabLineItems.reduce((sum, l) => sum + l.amount, 0),
  }));
}

export type ActivityEntry = {
  at: Date;
  kind: "request" | "charge";
  label: string;
  stayId: string;
};

/** Last ~N of (requests created, tab lines charged), newest first. */
export async function getRecentActivity(limit = 20): Promise<ActivityEntry[]> {
  const [requests, charged] = await Promise.all([
    prisma.serviceRequest.findMany({
      include: { service: true, stay: { include: { guest: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.tabLineItem.findMany({
      where: { status: "CHARGED" },
      include: { stay: { include: { guest: true } } },
      orderBy: { occurredAt: "desc" },
      take: limit,
    }),
  ]);

  return [
    ...requests.map((r) => ({
      at: r.createdAt,
      kind: "request" as const,
      label: `${r.stay.guest.firstName} requested ${r.service?.name ?? r.customTitle ?? "a service"}`,
      stayId: r.stayId,
    })),
    ...charged.map((l) => ({
      at: l.occurredAt,
      kind: "charge" as const,
      label: `Charged "${l.description}" — ${l.stay.guest.firstName}`,
      stayId: l.stayId,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}

/** Recent /plan trip intakes — World-B leads, newest first. */
export async function getRecentIntakes(limit = 25) {
  return prisma.tripIntake.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      guest: true,
      stay: { include: { guest: true, property: true } },
    },
  });
}

/**
 * Properties an operator can create a stay against: filters out /demo
 * sandbox property clones (every sandbox property carries an isDemo stay),
 * keeps canonical/real properties — including brand-new ones with no stays.
 */
export async function getConvertProperties() {
  return prisma.property.findMany({
    where: { stays: { none: { isDemo: true } } },
    orderBy: { name: "asc" },
  });
}

/** One intake with everything the convert page renders. */
export async function getIntakeDetail(intakeId: string) {
  return prisma.tripIntake.findUnique({
    where: { id: intakeId },
    include: {
      guest: true,
      stay: {
        include: {
          guest: true,
          property: true,
          accessTokens: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
}

/** Everything the per-stay detail page renders, in one query. */
export async function getOpsStayDetail(stayId: string) {
  return prisma.stay.findUnique({
    where: { id: stayId },
    include: {
      guest: true,
      property: true,
      accessTokens: true,
      paymentMethods: { orderBy: { createdAt: "desc" } },
      serviceRequests: {
        include: { service: true },
        orderBy: { createdAt: "desc" },
      },
      tabLineItems: { orderBy: { occurredAt: "desc" } },
      perkClaims: {
        include: { perk: true },
        orderBy: { createdAt: "desc" },
      },
      itineraryItems: { orderBy: [{ startsAt: "asc" }, { sortOrder: "asc" }] },
      tripIntakes: { orderBy: { createdAt: "desc" } },
    },
  });
}
