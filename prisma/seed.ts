import { PrismaClient } from "@prisma/client";
import { generateTokenId, buildToken } from "../src/lib/tokens";

// Load .env when run directly via tsx (prisma db seed also loads it).
try {
  process.loadEnvFile();
} catch {
  /* .env optional if vars already in environment */
}

const prisma = new PrismaClient();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Anchor the demo trip around "now" so it always feels live.
const now = new Date();
const at = (dayOffset: number, hour: number, minute = 0) => {
  const d = new Date(now.getTime() + dayOffset * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};

async function reset() {
  // Child → parent order (FK-safe). Dev seed: clean slate each run.
  await prisma.tabLineItem.deleteMany();
  await prisma.itineraryItem.deleteMany();
  await prisma.serviceRequest.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.accessToken.deleteMany();
  await prisma.stay.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.service.deleteMany();
  await prisma.property.deleteMany();
  await prisma.partner.deleteMany();
}

const CATALOG = [
  // ── L1 essentials — the demand-router core. Lead with these. ──
  {
    slug: "airport-transfer-slc",
    name: "Airport Transfer — SLC",
    category: "TRANSPORT" as const,
    shortDesc: "Private black-car transfer between Salt Lake City and your residence.",
    priceAmount: 38000,
    priceUnit: "FLAT" as const,
    priceNote: null,
    leadTimeHours: 12,
    requiresDate: true,
    requiresTime: true,
    requiresPartySize: false,
    sortOrder: 10,
  },
  {
    slug: "ski-bike-rental",
    name: "Ski & Bike Rental Delivery",
    category: "ACTIVITY" as const,
    shortDesc: "Premium skis, boards, or summer bikes — fitted and delivered to your door, swapped anytime.",
    longDesc:
      "Tell us your sizes and ability; our partner fits premium gear and delivers it to the residence before you arrive. Swap skis for boards — or bikes in summer — anytime during your stay, no shop visit.",
    priceAmount: 8500,
    priceUnit: "PER_PERSON" as const,
    priceNote: "per day",
    leadTimeHours: 24,
    requiresDate: true,
    requiresTime: false,
    requiresPartySize: true,
    sortOrder: 10,
  },
  {
    slug: "guided-fly-fishing",
    name: "Guided Fly-Fishing — Provo River",
    category: "ACTIVITY" as const,
    shortDesc: "A half-day on a blue-ribbon river with a local guide — all gear included.",
    priceAmount: 29500,
    priceUnit: "PER_PERSON" as const,
    priceNote: null,
    leadTimeHours: 48,
    requiresDate: true,
    requiresTime: true,
    requiresPartySize: true,
    sortOrder: 20,
  },
  {
    slug: "sunset-ebike-tour",
    name: "Sunset E-Bike & Vineyard Tour",
    category: "ACTIVITY" as const,
    shortDesc: "An easy guided e-bike loop into the foothills, ending with a sunset pour.",
    priceAmount: 18500,
    priceUnit: "PER_PERSON" as const,
    priceNote: null,
    leadTimeHours: 48,
    requiresDate: true,
    requiresTime: true,
    requiresPartySize: true,
    sortOrder: 30,
  },
  {
    slug: "private-ski-guide",
    name: "Private Ski Guide",
    category: "ACTIVITY" as const,
    shortDesc: "A certified guide for the day — first tracks, hidden stashes, no lift lines.",
    priceAmount: 95000,
    priceUnit: "PER_DAY" as const,
    priceNote: null,
    leadTimeHours: 24,
    requiresDate: true,
    requiresTime: false,
    requiresPartySize: true,
    sortOrder: 50,
  },
  {
    slug: "grocery-pre-stock",
    name: "Grocery Pre-Stock",
    category: "PROVISIONING" as const,
    shortDesc: "Arrive to a fully stocked kitchen, tailored to your list.",
    longDesc:
      "Send us your preferences and we'll have the kitchen, bar, and pantry stocked before you walk in. Priced to your list.",
    priceAmount: null,
    priceUnit: "QUOTE" as const,
    priceNote: "Quoted on request",
    leadTimeHours: 48,
    requiresDate: true,
    requiresTime: false,
    requiresPartySize: false,
    sortOrder: 10,
  },
  // ── Elevated (L2) — relationship heat, not the margin core. ──
  {
    slug: "in-residence-massage",
    name: "In-Residence Massage",
    category: "WELLNESS" as const,
    shortDesc: "A licensed therapist brings the spa to you — table, oils, and all.",
    priceAmount: 22000,
    priceUnit: "PER_PERSON" as const,
    priceNote: null,
    leadTimeHours: 24,
    requiresDate: true,
    requiresTime: true,
    requiresPartySize: true,
    sortOrder: 10,
  },
  {
    slug: "private-chef-dinner",
    name: "Private Chef Dinner",
    category: "DINING" as const,
    shortDesc: "A bespoke multi-course dinner, cooked and served in your residence.",
    longDesc:
      "One of our private chefs designs a menu around your tastes, sources locally, and handles everything from mise en place to the final plate — and the cleanup. You simply sit down to dinner.",
    priceAmount: 85000,
    priceUnit: "FLAT" as const,
    priceNote: "from",
    leadTimeHours: 48,
    requiresDate: true,
    requiresTime: true,
    requiresPartySize: true,
    sortOrder: 10,
  },
  {
    slug: "sommelier-wine-pairing",
    name: "Sommelier Wine Pairing",
    category: "DINING" as const,
    shortDesc: "A curated cellar selection paired to your dinner by a master sommelier.",
    priceAmount: 45000,
    priceUnit: "FLAT" as const,
    priceNote: "from",
    leadTimeHours: 48,
    requiresDate: true,
    requiresTime: true,
    requiresPartySize: false,
    sortOrder: 20,
  },
  {
    slug: "daily-housekeeping",
    name: "Daily Housekeeping",
    category: "HOUSEHOLD" as const,
    shortDesc: "A discreet midday refresh — beds, towels, tidy, and reset.",
    priceAmount: 18000,
    priceUnit: "FLAT" as const,
    priceNote: null,
    leadTimeHours: 12,
    requiresDate: true,
    requiresTime: false,
    requiresPartySize: false,
    sortOrder: 30,
  },
  {
    slug: "backcountry-heli-day",
    name: "Backcountry Heli Day",
    category: "OTHER" as const,
    shortDesc: "A guided helicopter day in untouched alpine terrain.",
    priceAmount: null,
    priceUnit: "QUOTE" as const,
    priceNote: "Quoted on request",
    leadTimeHours: 72,
    requiresDate: true,
    requiresTime: false,
    requiresPartySize: true,
    sortOrder: 10,
  },
];

async function main() {
  await reset();

  // Demo partner — the co-brand sales weapon. Default is FICTIONAL on purpose
  // (the deploy is live; never ship a real PM's brand uninvited). For a real
  // pitch, hot-swap via env and reseed:
  //   $env:DEMO_PARTNER_NAME = "Luxury Park City Rentals"; npm run db:seed
  const partnerName = process.env.DEMO_PARTNER_NAME ?? "Alpine Crest Collection";
  const partner = await prisma.partner.create({
    data: {
      slug: partnerName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      name: partnerName,
      accentColor: process.env.DEMO_PARTNER_ACCENT ?? "#7a6248", // warm bronze
      logoUrl: process.env.DEMO_PARTNER_LOGO_URL ?? null,
    },
  });

  const property = await prisma.property.create({
    data: {
      name: "Empire Pass Chalet",
      partnerId: partner.id,
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

  await prisma.service.createMany({
    data: CATALOG.map((s) => ({ ...s })),
  });

  const guest = await prisma.guest.create({
    data: {
      firstName: "Parker",
      lastName: "Bell",
      email: "parker@example.com",
      notes: "Prefers still water, early riser, loves a good cabernet.",
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
        location: "In-residence",
        category: "DINING",
        startsAt: new Date(now.getTime() + 3 * HOUR),
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

  // Card on file (mock) + a couple of pre-arrival charges so the tab feels real.
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

  await prisma.tabLineItem.createMany({
    data: [
      {
        stayId: stay.id,
        description: "Airport transfer — SLC arrival",
        amount: 38000,
        status: "CHARGED",
        paymentMethodId: card.id,
        occurredAt: new Date(now.getTime() - 2 * DAY + 15 * HOUR),
      },
      {
        stayId: stay.id,
        description: "Pre-arrival grocery provisioning",
        amount: 28500,
        status: "CHARGED",
        paymentMethodId: card.id,
        occurredAt: new Date(now.getTime() - 2 * DAY - 4 * HOUR),
      },
    ],
  });

  // Access token — the per-guest link.
  const tokenId = generateTokenId();
  await prisma.accessToken.create({
    data: { id: tokenId, stayId: stay.id, label: "pre-arrival email" },
  });

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const link = `${base}/t/${buildToken(tokenId)}`;

  console.log("\n  Seeded Summit demo.");
  console.log(`  Guest:    ${guest.firstName} ${guest.lastName ?? ""}`.trimEnd());
  console.log(`  Property: ${property.name}`);
  console.log(`  Partner:  ${partner.name} (accent ${partner.accentColor})`);
  console.log(`  Services: ${CATALOG.length}`);
  console.log("\n  ── Demo link ──────────────────────────────────────────");
  console.log(`  ${link}`);
  console.log("  ───────────────────────────────────────────────────────\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
