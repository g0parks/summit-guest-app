// NOTE: deliberately free of `server-only` (like tokens.ts) — the seed runs
// this via tsx outside Next. Callers pass their own PrismaClient.
import type { PrismaClient } from "@prisma/client";
import { buildToken, generateTokenId } from "./tokens";

/**
 * The demo-trip template, shared by `prisma/seed.ts` (the canonical seeded
 * stay) and `/demo` (per-visitor sandboxes). One template = the seeded demo
 * and every sandbox stay in shape-lockstep: itinerary anchored to "now",
 * card on file, two settled starter lines so the tab feels real.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const DEMO_TTL_DAYS = 30; // sandbox lifetime — the PM leave-behind window
const DEMO_STAY_CAP = 500; // sanity cap on accumulated sandboxes

export type DemoGuest = {
  firstName: string;
  lastName?: string;
  notes?: string;
};

/** Neutral sandbox guest — PMs hold this link, so no real names. */
export const SANDBOX_GUEST: DemoGuest = {
  firstName: "Guest",
  notes: "First time in Park City — keen to ski Empire Pass.",
};

const MT = "America/Denver";

/**
 * A Date for the given wall-clock time IN MOUNTAIN TIME, `dayOffset` days
 * from `base`. The naive `setHours()` uses the SERVER's timezone — on Vercel
 * that's UTC, which stored "4 PM" as 10 AM Mountain. The demo property lives
 * in Park City; its itinerary must too, wherever the code runs.
 */
function mountainAt(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  const day = new Date(base.getTime() + dayOffset * DAY);
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: MT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(day)
    .split("-")
    .map(Number);
  // First pass assumes UTC-7 (MST); one correction handles DST (UTC-6).
  let ts = Date.UTC(ymd[0] ?? 0, (ymd[1] ?? 1) - 1, ymd[2] ?? 1, hour + 7, minute);
  const gotHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: MT,
      hour: "numeric",
      hour12: false,
    }).format(ts),
  );
  ts += (hour - gotHour) * HOUR;
  return new Date(ts);
}

export async function createDemoStay(
  prisma: PrismaClient,
  opts: {
    partnerId: string | null;
    isDemo: boolean;
    guest: DemoGuest;
    tokenLabel: string;
  },
) {
  const now = new Date();
  const at = (dayOffset: number, hour: number, minute = 0) =>
    mountainAt(now, dayOffset, hour, minute);

  // Each sandbox gets its OWN property row so the partner co-brand resolves
  // per-visitor without touching anyone else's sandbox.
  const property = await prisma.property.create({
    data: {
      name: "Empire Pass Chalet",
      partnerId: opts.partnerId,
      addressLine1: "12 Red Cloud Trail",
      city: "Park City",
      region: "UT",
      postalCode: "84060",
      timezone: "America/Denver",
      checkInTime: "16:00",
      checkOutTime: "10:00",
      wifiNetwork: "EmpirePass-Guest",
      wifiPassword: "summit-snow-2026",
      description:
        "A ski-in/ski-out residence on Deer Valley's Empire Pass, with a private hot tub, stone hearth, and views down the valley.",
    },
  });

  const guest = await prisma.guest.create({
    data: {
      firstName: opts.guest.firstName,
      lastName: opts.guest.lastName ?? null,
      // Email deliberately empty — the Perk Bank claim is the first-party
      // capture moment, and its contact lands on the CLAIM row regardless.
      // Phone IS seeded — Parker's dev number, BY REQUEST (2026-06-12): the
      // ops Nudge demos live (an sms: draft, not the copy fallback) and the
      // draft lands on a phone he holds during a pitch.
      phone: "+19104200302",
      notes: opts.guest.notes ?? null,
    },
  });

  const stay = await prisma.stay.create({
    data: {
      guestId: guest.id,
      propertyId: property.id,
      arrivalDate: new Date(now.getTime() - 2 * DAY),
      departureDate: new Date(now.getTime() + 2 * DAY),
      partySize: 4,
      currency: "usd",
      status: "active",
      isDemo: opts.isDemo,
    },
  });

  // Itinerary — a few curated moments across the stay.
  await prisma.itineraryItem.createMany({
    data: [
      {
        stayId: stay.id,
        title: "Arrival & check-in",
        description: "Your host meets you at the residence with a welcome pour.",
        location: "Empire Pass Chalet",
        category: "ARRIVAL",
        startsAt: at(-2, 16, 0),
        allDay: false,
        sortOrder: 1,
      },
      {
        stayId: stay.id,
        title: "Ski valet & boot fitting",
        description: "Skis, boots, and helmets fitted and delivered to the mudroom.",
        location: "Mudroom",
        category: "ACTIVITY",
        startsAt: at(-1, 8, 30),
        sortOrder: 2,
      },
      {
        stayId: stay.id,
        title: "First tracks with your guide",
        description: "Meet your private guide at the Silver Lake gondola.",
        location: "Silver Lake Lodge",
        category: "ACTIVITY",
        startsAt: at(-1, 9, 30),
        sortOrder: 3,
      },
      {
        stayId: stay.id,
        title: "Private chef dinner",
        description: "Five courses, paired, served at the stone hearth.",
        // pinned to a real dinner hour — NOT now+3h, which rendered at
        // whatever odd time the sandbox happened to be created
        startsAt: at(0, 18, 30),
        location: "In-residence",
        category: "DINING",
        sortOrder: 4,
      },
      {
        stayId: stay.id,
        title: "Fresh-snow guided descent",
        description: "Your guide reads the overnight report and picks the lines.",
        location: "Empire Pass",
        category: "ACTIVITY",
        startsAt: at(1, 9, 0),
        sortOrder: 5,
      },
      {
        stayId: stay.id,
        title: "In-residence massage",
        description: "Two therapists, après-ski recovery.",
        location: "In-residence",
        category: "WELLNESS",
        startsAt: at(1, 16, 30),
        sortOrder: 6,
      },
      {
        stayId: stay.id,
        title: "Departure & checkout",
        description: "Bags handled; transfer to SLC arranged.",
        location: "Empire Pass Chalet",
        category: "DEPARTURE",
        startsAt: at(2, 10, 0),
        sortOrder: 7,
      },
    ],
  });

  // Card on file (mock) + pre-arrival charges so the tab feels real.
  const card = await prisma.paymentMethod.create({
    data: {
      stayId: stay.id,
      provider: "MOCK",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2027,
      isDefault: true,
    },
  });

  // Already-settled theater. chargeDueAt is set to when each line occurred so
  // the invariant holds — every line created since the money path shipped
  // carries a due date, none can silently rot with a null. pmShareCents stays 0:
  // sandbox money is nobody's revenue (src/lib/tabLine.ts).
  const transferAt = new Date(now.getTime() - 2 * DAY + 15 * HOUR);
  const groceryAt = new Date(now.getTime() - 2 * DAY - 4 * HOUR);
  await prisma.tabLineItem.createMany({
    data: [
      {
        stayId: stay.id,
        description: "Airport transfer — SLC arrival",
        amount: 38000,
        status: "CHARGED",
        paymentMethodId: card.id,
        occurredAt: transferAt,
        chargeDueAt: transferAt,
        pmShareCents: 0,
      },
      {
        stayId: stay.id,
        description: "Pre-arrival grocery provisioning",
        amount: 28500,
        status: "CHARGED",
        paymentMethodId: card.id,
        occurredAt: groceryAt,
        chargeDueAt: groceryAt,
        pmShareCents: 0,
      },
    ],
  });

  const tokenId = generateTokenId();
  await prisma.accessToken.create({
    data: { id: tokenId, stayId: stay.id, label: opts.tokenLabel },
  });

  return { stay, property, guest, token: buildToken(tokenId) };
}

/**
 * Lazy sandbox GC, run on each /demo hit: delete demo stays past the TTL
 * (plus the oldest beyond the cap), then their now-orphaned guests and
 * properties. The seeded stay is isDemo=false — never touched.
 */
export async function cleanupDemoStays(prisma: PrismaClient): Promise<number> {
  const cutoff = new Date(Date.now() - DEMO_TTL_DAYS * DAY);
  const select = { id: true, guestId: true, propertyId: true } as const;

  const stale = await prisma.stay.findMany({
    where: { isDemo: true, createdAt: { lt: cutoff } },
    select,
  });

  // Cap guard: if fresh sandboxes alone exceed the cap, prune the oldest.
  const freshCount = await prisma.stay.count({
    where: { isDemo: true, createdAt: { gte: cutoff } },
  });
  const overflow =
    freshCount > DEMO_STAY_CAP
      ? await prisma.stay.findMany({
          where: { isDemo: true, createdAt: { gte: cutoff } },
          orderBy: { createdAt: "asc" },
          take: freshCount - DEMO_STAY_CAP,
          select,
        })
      : [];

  const doomed = [...stale, ...overflow];
  if (doomed.length === 0) return 0;

  const stayIds = doomed.map((s) => s.id);
  const where = { stayId: { in: stayIds } };

  // Children → stay → orphaned parents (FK-safe).
  await prisma.guestTouch.deleteMany({ where });
  await prisma.changeRequest.deleteMany({ where });
  await prisma.perkClaim.deleteMany({ where });
  await prisma.tabLineItem.deleteMany({ where });
  await prisma.itineraryItem.deleteMany({ where });
  await prisma.serviceRequest.deleteMany({ where });
  await prisma.paymentMethod.deleteMany({ where });
  await prisma.accessToken.deleteMany({ where });
  await prisma.stay.deleteMany({ where: { id: { in: stayIds } } });
  await prisma.guest.deleteMany({
    where: { id: { in: doomed.map((s) => s.guestId) }, stays: { none: {} } },
  });
  await prisma.property.deleteMany({
    where: { id: { in: doomed.map((s) => s.propertyId) }, stays: { none: {} } },
  });

  return doomed.length;
}
