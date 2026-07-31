import "server-only";
import { prisma } from "./db";
import { getStayPhase } from "./stayPhase";

/**
 * Ops-console queries ONLY. `queries.ts` stays guest-only so it's obvious
 * which surface sees what — these results carry internal economics fields
 * (vendorCostCents / pmShareCents / netCents) that must never reach a
 * guest-facing page.
 */

const HOUR = 60 * 60 * 1000;

/**
 * Lazy EXPIRED sweep, run on each dashboard load (the /demo GC pattern —
 * best-effort, never blocks the page): open SIGNALED/READY/QUOTED signals on
 * departed stays flip to EXPIRED — an unapproved quote dies with the stay
 * too. Unconverted demand is still data — the broker's book records what was
 * wanted, not just what was sold; rows are kept, never deleted. Departure is
 * phase-derived (day-granular, property tz) — the departureDate prefilter
 * just keeps the candidate set small.
 */
async function sweepExpiredSignals(): Promise<void> {
  try {
    const candidates = await prisma.serviceRequest.findMany({
      where: {
        status: { in: ["SIGNALED", "READY", "QUOTED"] },
        stay: { departureDate: { lt: new Date() } },
      },
      select: {
        id: true,
        stay: {
          select: {
            arrivalDate: true,
            departureDate: true,
            property: { select: { timezone: true } },
          },
        },
      },
    });
    const expired = candidates
      .filter((r) => getStayPhase(r.stay, r.stay.property.timezone) === "POST_STAY")
      .map((r) => r.id);
    if (expired.length > 0) {
      await prisma.serviceRequest.updateMany({
        where: { id: { in: expired }, status: { in: ["SIGNALED", "READY", "QUOTED"] } },
        data: { status: "EXPIRED" },
      });
    }
  } catch (err) {
    console.error("[ops] expired-signal sweep failed:", err);
  }
}

/**
 * The six queues (Product Doctrine 2026-06-12) — one section, one action
 * each. Perk claims ride along (they had a triage home before and still
 * need arranging). Runs the EXPIRED sweep first so departed stays' open
 * signals never show up as actionable.
 */
export async function getOpsQueues() {
  await sweepExpiredSignals();

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * HOUR);
  const include = {
    service: true,
    stay: { include: { guest: true, property: true } },
  } as const;

  const [newSignals, awaitingGuest, readyToRoute, scheduled, changes, pendingLines, perkClaims] =
    await Promise.all([
      // 1 — New signals: tapped in the last 24h; the guest is likely still
      //     filling the wizard. Watch, don't chase.
      prisma.serviceRequest.findMany({
        where: { status: "SIGNALED", createdAt: { gte: dayAgo } },
        include,
        orderBy: { createdAt: "desc" },
      }),
      // 2 — Awaiting guest: signals stalled ≥24h AND every outstanding quote
      //     (the guest's tap is the money moment — it must never be
      //     invisible). The one action is the Nudge (operator-tapped sms:
      //     draft with a wizard deep link), so the stay's tokens ride along.
      prisma.serviceRequest.findMany({
        where: {
          OR: [
            { status: "SIGNALED", createdAt: { lt: dayAgo } },
            { status: "QUOTED" },
          ],
        },
        include: {
          service: true,
          stay: { include: { guest: true, property: true, accessTokens: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      // 3 — Ready to route: execution-complete; QUOTE dishes get priced here.
      prisma.serviceRequest.findMany({
        where: { status: "READY" },
        include,
        orderBy: { createdAt: "asc" },
      }),
      // 4 — Scheduled: confirmed work being delivered in the next 48h.
      prisma.serviceRequest.findMany({
        where: {
          status: { in: ["CONFIRMED", "SCHEDULED"] },
          requestedFor: { gte: now, lte: new Date(now.getTime() + 48 * HOUR) },
        },
        include,
        orderBy: { requestedFor: "asc" },
      }),
      // 5 — Changes: open structured change asks; apply or decline, one tap.
      prisma.changeRequest.findMany({
        where: { status: "OPEN" },
        include: {
          itineraryItem: true,
          serviceRequest: { include: { service: true } },
          stay: { include: { guest: true, property: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      // 6 — Charges: every PENDING line, due-first. The one action is the
      //     Charge tap (money doctrine 2026-07-27: a human taps every charge),
      //     so the guest's phone + a live token ride along for the card-update
      //     draft when a card fails.
      prisma.tabLineItem.findMany({
        where: { status: "PENDING" },
        include: {
          stay: { include: { guest: true, property: true, accessTokens: true } },
          serviceRequest: { include: { service: { select: { name: true } } } },
        },
      }),
      prisma.perkClaim.findMany({
        where: { status: "CLAIMED" },
        include: { perk: true, stay: { include: { guest: true, property: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  /**
   * Due-first ranking. `chargeDueAt` is null on every line created before the
   * money path shipped, and a null would sort last in SQL — exactly where an
   * unpaid line must NOT go. So each line gets an effective date: its own due
   * date, or (for legacy rows) the stay's departure once departed, else the
   * line's creation. Departed stays' unpaid lines and legacy rows both land in
   * the past and float to the top as overdue, which is the truth.
   */
  const chargesDue = pendingLines
    .map((line) => {
      const departed =
        getStayPhase(line.stay, line.stay.property.timezone) === "POST_STAY";
      const effectiveDueAt =
        line.chargeDueAt ?? (departed ? line.stay.departureDate : line.createdAt);
      return {
        ...line,
        departed,
        effectiveDueAt,
        due: effectiveDueAt.getTime() <= now.getTime(),
        /** No due date of its own — created before the money path. */
        legacy: line.chargeDueAt == null,
      };
    })
    .sort((a, b) => a.effectiveDueAt.getTime() - b.effectiveDueAt.getTime());

  return {
    newSignals,
    awaitingGuest,
    readyToRoute,
    scheduled,
    changes,
    chargesDue,
    perkClaims,
  };
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
 * First token that still resolves — what an operator nudge deep-links on.
 * Shared by the Awaiting-guest queue and the charge queue's card-update draft.
 */
export function liveTokenId(
  tokens: { id: string; revokedAt: Date | null; expiresAt: Date | null }[],
): string | null {
  const now = Date.now();
  return (
    tokens.find((t) => !t.revokedAt && (!t.expiresAt || t.expiresAt.getTime() > now))
      ?.id ?? null
  );
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

/**
 * TripIntake sources that are Aerie SALES leads (PM prospects from the demo
 * pop-up + the flyer contact form), NOT guest /plan intakes. They share the
 * TripIntake table but are a different audience — reach out and sell Aerie,
 * never "convert to a stay" — so the two surface in separate ops panels.
 */
export const LEAD_SOURCES = ["demo-lead", "aerie-contact"];

/** Recent /plan trip intakes — World-B GUEST leads, newest first. Excludes the
 *  Aerie prospect leads (those get their own panel via getRecentLeads). The
 *  null-source OR keeps /plan intakes that carry no ?src= (notIn alone would
 *  drop NULLs under SQL three-valued logic). */
export async function getRecentIntakes(limit = 25) {
  return prisma.tripIntake.findMany({
    where: { OR: [{ source: null }, { source: { notIn: LEAD_SOURCES } }] },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      guest: true,
      stay: { include: { guest: true, property: true } },
    },
  });
}

/** Recent Aerie prospect leads — the demo pop-up + the flyer contact form.
 *  PM/sales leads to reach out to, distinct from guest /plan intakes. */
export async function getRecentLeads(limit = 25) {
  return prisma.tripIntake.findMany({
    where: { source: { in: LEAD_SOURCES } },
    orderBy: { createdAt: "desc" },
    take: limit,
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
