import "server-only";
import { prisma } from "./db";
import { computeChargeCents, isFixedPrice } from "./catalog";
import { interestedSlugs, parseIntakeAnswers } from "./intakeFlow";

/**
 * The Broker's Book — the demand + economics views that make Summit's data
 * an asset, not exhaust (Product Doctrine 2026-06-12; Model & Shape: the
 * cross-PM spend graph and the curated vendor network are what compound).
 *
 * Three audiences, one source of truth:
 *  - FORWARD DEMAND: what's booked, in motion, and signaled by lead — the
 *    thing the operator shows a VENDOR ("here's what's coming through").
 *  - UNCONVERTED DEMAND: expired/declined — the record of what guests
 *    WANTED. Next-stay personalization + vendor negotiation data.
 *  - PARTNER VALUE: the PM-safe story per partner — what Summit did for
 *    their guests. NEVER carries net, vendor cost, or rev-share language
 *    (the internal-economics rule, CLAUDE.md).
 *
 * Demo sandboxes (Stay.isDemo) are excluded everywhere — the book is the
 * business, not the pitch prop.
 */

const OPEN_STATUSES = ["SIGNALED", "READY", "QUOTED", "CONFIRMED", "SCHEDULED"] as const;

export type DemandRow = {
  key: string;
  serviceName: string;
  category: string;
  /** CONFIRMED + SCHEDULED — vendor-bookable work. */
  booked: number;
  /** SIGNALED + READY + QUOTED — demand still maturing. */
  inMotion: number;
  /** World-B /plan leads (unconverted) who tapped interest in this service. */
  leadInterest: number;
  /** Sum of party sizes across open requests — heads, the vendor's unit. */
  heads: number;
  /** Soonest scheduled date among booked work. */
  nextDate: Date | null;
  /** $ on the tab (pending+charged) behind booked requests. */
  committedCents: number;
  /** $ quoted and waiting on the guest's approval tap. */
  awaitingYesCents: number;
};

/** Forward demand by service — open requests + unconverted lead interest. */
export async function getDemandBook(): Promise<DemandRow[]> {
  const [requests, leadIntakes] = await Promise.all([
    prisma.serviceRequest.findMany({
      where: { status: { in: [...OPEN_STATUSES] }, stay: { isDemo: false } },
      include: {
        service: true,
        stay: { select: { partySize: true } },
        tabLineItems: { where: { status: { in: ["PENDING", "CHARGED"] } } },
      },
    }),
    // World B: a lead's interest is demand before there's even a stay.
    prisma.tripIntake.findMany({
      where: { convertedAt: null, stayId: null },
      select: { answersJson: true },
    }),
  ]);

  const leadCounts = new Map<string, number>();
  for (const intake of leadIntakes) {
    for (const slug of interestedSlugs(parseIntakeAnswers(intake.answersJson))) {
      leadCounts.set(slug, (leadCounts.get(slug) ?? 0) + 1);
    }
  }

  const rows = new Map<string, DemandRow>();
  for (const r of requests) {
    const key = r.service?.slug ?? "custom";
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        serviceName: r.service?.name ?? "Concierge — custom asks",
        category: r.service?.category ?? "OTHER",
        booked: 0,
        inMotion: 0,
        leadInterest: leadCounts.get(key) ?? 0,
        heads: 0,
        nextDate: null,
        committedCents: 0,
        awaitingYesCents: 0,
      };
      rows.set(key, row);
    }
    const heads = r.partySize ?? r.stay.partySize ?? 1;
    row.heads += heads;

    if (r.status === "CONFIRMED" || r.status === "SCHEDULED") {
      row.booked += 1;
      row.committedCents += r.tabLineItems.reduce((sum, l) => sum + l.amount, 0);
      if (
        r.requestedFor &&
        r.requestedFor.getTime() > Date.now() &&
        (!row.nextDate || r.requestedFor < row.nextDate)
      ) {
        row.nextDate = r.requestedFor;
      }
    } else {
      row.inMotion += 1;
      if (r.status === "QUOTED" && r.quotedAmount != null) {
        row.awaitingYesCents += r.quotedAmount;
      } else if (
        r.service &&
        isFixedPrice(r.service.priceUnit, r.service.priceAmount)
      ) {
        // A signal on a fixed-price dish has a knowable value — count it as
        // maturing pipeline, not committed money.
        row.awaitingYesCents += computeChargeCents(
          r.service.priceUnit,
          r.service.priceAmount,
          heads,
        );
      }
    }
  }

  // Lead-only services (interest exists, no requests yet) still belong in
  // the book — demand is demand.
  if (leadCounts.size > 0) {
    const slugs = [...leadCounts.keys()].filter((s) => !rows.has(s));
    if (slugs.length > 0) {
      const services = await prisma.service.findMany({ where: { slug: { in: slugs } } });
      for (const s of services) {
        rows.set(s.slug, {
          key: s.slug,
          serviceName: s.name,
          category: s.category,
          booked: 0,
          inMotion: 0,
          leadInterest: leadCounts.get(s.slug) ?? 0,
          heads: 0,
          nextDate: null,
          committedCents: 0,
          awaitingYesCents: 0,
        });
      }
    }
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.committedCents - a.committedCents ||
      b.inMotion + b.leadInterest - (a.inMotion + a.leadInterest),
  );
}

export type UnconvertedRow = {
  serviceName: string;
  expired: number;
  declined: number;
};

/** The record of what was wanted — expired signals and declined asks. */
export async function getUnconvertedDemand(): Promise<UnconvertedRow[]> {
  const requests = await prisma.serviceRequest.findMany({
    where: { status: { in: ["EXPIRED", "DECLINED"] }, stay: { isDemo: false } },
    include: { service: { select: { name: true } } },
  });
  const rows = new Map<string, UnconvertedRow>();
  for (const r of requests) {
    const name = r.service?.name ?? "Concierge — custom asks";
    const row = rows.get(name) ?? { serviceName: name, expired: 0, declined: 0 };
    if (r.status === "EXPIRED") row.expired += 1;
    else row.declined += 1;
    rows.set(name, row);
  }
  return [...rows.values()].sort(
    (a, b) => b.expired + b.declined - (a.expired + a.declined),
  );
}

export type EconomicsRollup = {
  chargedCents: number;
  pendingCents: number;
  vendorCostCents: number;
  netCents: number;
  /** Lines carrying economics vs all lines — how complete the book is. */
  linesWithEconomics: number;
  lines: number;
  byCategory: { label: string; gmvCents: number; netCents: number; lines: number }[];
  byPartner: { label: string; gmvCents: number; netCents: number; lines: number }[];
};

/** INTERNAL ONLY — never surfaces to a guest or PM (the rev-share rule). */
export async function getEconomicsRollup(): Promise<EconomicsRollup> {
  const lines = await prisma.tabLineItem.findMany({
    where: { status: { in: ["PENDING", "CHARGED"] }, stay: { isDemo: false } },
    include: {
      serviceRequest: { include: { service: { select: { category: true } } } },
      stay: { include: { property: { include: { partner: true } } } },
    },
  });

  const rollup: EconomicsRollup = {
    chargedCents: 0,
    pendingCents: 0,
    vendorCostCents: 0,
    netCents: 0,
    linesWithEconomics: 0,
    lines: lines.length,
    byCategory: [],
    byPartner: [],
  };
  const byCategory = new Map<string, { gmvCents: number; netCents: number; lines: number }>();
  const byPartner = new Map<string, { gmvCents: number; netCents: number; lines: number }>();

  for (const l of lines) {
    if (l.status === "CHARGED") rollup.chargedCents += l.amount;
    else rollup.pendingCents += l.amount;
    if (l.vendorCostCents != null) {
      rollup.vendorCostCents += l.vendorCostCents;
      rollup.linesWithEconomics += 1;
    }
    if (l.netCents != null) rollup.netCents += l.netCents;

    const cat = l.serviceRequest?.service?.category ?? "MANUAL";
    const catRow = byCategory.get(cat) ?? { gmvCents: 0, netCents: 0, lines: 0 };
    catRow.gmvCents += l.amount;
    catRow.netCents += l.netCents ?? 0;
    catRow.lines += 1;
    byCategory.set(cat, catRow);

    const partner = l.stay.property.partner?.name ?? "Direct / unpartnered";
    const pRow = byPartner.get(partner) ?? { gmvCents: 0, netCents: 0, lines: 0 };
    pRow.gmvCents += l.amount;
    pRow.netCents += l.netCents ?? 0;
    pRow.lines += 1;
    byPartner.set(partner, pRow);
  }

  rollup.byCategory = [...byCategory.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.gmvCents - a.gmvCents);
  rollup.byPartner = [...byPartner.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.gmvCents - a.gmvCents);
  return rollup;
}

export type PartnerValue = {
  partnerName: string;
  stays: number;
  upcomingStays: number;
  guests: number;
  requestsArranged: number;
  requestsFulfilled: number;
  /** Guest-services GMV (pending + charged) — PM-safe, it's THEIR guests' delight. */
  gmvCents: number;
  perksClaimed: number;
  contactsCaptured: number;
  optIns: number;
  returnIntents: number;
};

/**
 * The PM story, per partner — every number here is safe to say to the PM.
 * Internal economics (net, vendor cost, shares) deliberately absent.
 */
export async function getPartnerValue(): Promise<PartnerValue[]> {
  const stays = await prisma.stay.findMany({
    where: { isDemo: false },
    include: {
      property: { include: { partner: true } },
      serviceRequests: { select: { status: true } },
      tabLineItems: {
        where: { status: { in: ["PENDING", "CHARGED"] } },
        select: { amount: true },
      },
      perkClaims: { select: { email: true, phone: true, marketingOptIn: true } },
      guest: {
        select: {
          id: true,
          tripIntakes: {
            where: { stayId: null, guestId: { not: null }, source: "post-stay" },
            select: { id: true },
          },
        },
      },
    },
  });

  const now = Date.now();
  const map = new Map<string, PartnerValue & { guestIds: Set<string>; intentIds: Set<string> }>();
  for (const s of stays) {
    const name = s.property.partner?.name ?? "Direct / unpartnered";
    let row = map.get(name);
    if (!row) {
      row = {
        partnerName: name,
        stays: 0,
        upcomingStays: 0,
        guests: 0,
        requestsArranged: 0,
        requestsFulfilled: 0,
        gmvCents: 0,
        perksClaimed: 0,
        contactsCaptured: 0,
        optIns: 0,
        returnIntents: 0,
        guestIds: new Set<string>(),
        intentIds: new Set<string>(),
      };
      map.set(name, row);
    }
    row.stays += 1;
    if (s.arrivalDate.getTime() > now) row.upcomingStays += 1;
    row.guestIds.add(s.guest.id);
    for (const r of s.serviceRequests) {
      if (r.status === "CONFIRMED" || r.status === "SCHEDULED" || r.status === "COMPLETED") {
        row.requestsArranged += 1;
      }
      if (r.status === "COMPLETED") row.requestsFulfilled += 1;
    }
    row.gmvCents += s.tabLineItems.reduce((sum, l) => sum + l.amount, 0);
    row.perksClaimed += s.perkClaims.length;
    row.contactsCaptured += s.perkClaims.filter((c) => c.email || c.phone).length;
    row.optIns += s.perkClaims.filter((c) => c.marketingOptIn).length;
    // Return intents dedupe per intake row (a guest with two partner stays
    // shouldn't double-count one intent).
    for (const intent of s.guest.tripIntakes) row.intentIds.add(intent.id);
  }

  return [...map.values()]
    .map(({ guestIds, intentIds, ...row }) => ({
      ...row,
      guests: guestIds.size,
      returnIntents: intentIds.size,
    }))
    .sort((a, b) => b.gmvCents - a.gmvCents);
}

/**
 * The copy-ready PM recap — the "undeniable value" note the operator pastes
 * into an email or text to the PM. Register: their guests, their win, Summit
 * quiet. NO pricing-model language ("vendor-funded" is PM-facing only in
 * conversation, never in writing here), NO internal economics, NO promises.
 */
export function pmRecapText(v: PartnerValue, dollars: string): string {
  const lines = [
    `A quick look at what your guests used us for:`,
    ``,
    `· ${v.stays} stay${v.stays === 1 ? "" : "s"} looked after (${v.upcomingStays} coming up)`,
    `· ${v.requestsArranged} service${v.requestsArranged === 1 ? "" : "s"} arranged for your guests${v.requestsFulfilled > 0 ? ` — ${v.requestsFulfilled} delivered` : ""}`,
    `· ${dollars} in guest services taken care of, end to end`,
    `· ${v.perksClaimed} welcome perk${v.perksClaimed === 1 ? "" : "s"} claimed${v.optIns > 0 ? ` (${v.optIns} guest${v.optIns === 1 ? "" : "s"} opted in to hear from us again)` : ""}`,
  ];
  if (v.returnIntents > 0) {
    lines.push(
      `· ${v.returnIntents} guest${v.returnIntents === 1 ? "" : "s"} already told us they want to come back — we'll route them to you`,
    );
  }
  lines.push(
    ``,
    `Your guests never pulled out a wallet, and every request landed with a human who handled it. Costs you nothing, as always — that's the arrangement.`,
  );
  return lines.join("\n");
}
