import { PrismaClient } from "@prisma/client";
import { createDemoStay } from "../src/lib/demoStay";

// Load .env when run directly via tsx (prisma db seed also loads it).
try {
  process.loadEnvFile();
} catch {
  /* .env optional if vars already in environment */
}

const prisma = new PrismaClient();

async function reset() {
  // Child → parent order (FK-safe). Dev seed: clean slate each run.
  await prisma.perkClaim.deleteMany();
  await prisma.tabLineItem.deleteMany();
  await prisma.itineraryItem.deleteMany();
  await prisma.serviceRequest.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.accessToken.deleteMany();
  await prisma.stay.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.service.deleteMany();
  await prisma.property.deleteMany();
  await prisma.perk.deleteMany();
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

  await prisma.service.createMany({
    data: CATALOG.map((s) => ({ ...s })),
  });

  // Perk Bank — gifts that double as first-party capture. Recovery/wellness
  // leads (the whale filter). costCents is INTERNAL qualified-CAC, never
  // guest- or PM-facing. Register: "with our compliments", never "exclusive".
  await prisma.perk.createMany({
    data: [
      {
        slug: "recovery-lounge-session",
        name: "Recovery Lounge Session",
        vendorName: "Avanto",
        shortDesc:
          "A contrast-therapy session — cedar sauna, cold plunge, guided breathwork — on us.",
        longDesc:
          "Avanto's recovery lounge sits ten minutes from the slopes: cedar sauna, cold plunge, and a guided contrast circuit that undoes a ski day better than anything we know. Your first session is with our compliments — just tell us how to reach you and we'll arrange a time that fits your week.",
        valueLabel: "$65 value",
        costCents: 3500, // internal qualified-CAC
        partnerId: null, // available across all partners
        sortOrder: 10,
      },
      {
        slug: "welcome-provisioning-basket",
        name: "Welcome Provisioning Basket",
        shortDesc:
          "Local roast coffee, fresh pastries, and alpine spring water — on the counter when you walk in.",
        longDesc:
          "A small welcome from the house: locally roasted coffee, morning pastries from a Park City bakery, and alpine spring water, set out before you arrive. Claim it and we'll have it waiting.",
        valueLabel: "$40 value",
        costCents: 2200, // internal qualified-CAC
        partnerId: partner.id, // partner-scoped perk — exercises the visibility branch
        sortOrder: 20,
      },
      {
        slug: "private-sauna-half-off",
        name: "Private Sauna Hour — Half Off",
        vendorName: "Avanto",
        shortDesc:
          "A private sauna hour for your group at half the usual rate, any evening of your stay.",
        longDesc:
          "Book a private sauna hour for your whole group at half the usual rate — any evening during your stay, towels and cold rinse included. Claim it and we'll hold the slot until you pick a night.",
        valueLabel: "50% off",
        costCents: 1500, // internal qualified-CAC
        partnerId: null,
        sortOrder: 30,
      },
    ],
  });

  // Canonical seeded demo stay (isDemo: false — never GC'd by /demo cleanup).
  // Same template the /demo sandboxes use, so the two never drift.
  const { guest, property, token } = await createDemoStay(prisma, {
    partnerId: partner.id,
    isDemo: false,
    guest: {
      firstName: "Parker",
      lastName: "Bell",
      notes: "Prefers still water, early riser, loves a good cabernet.",
    },
    tokenLabel: "pre-arrival email",
  });

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const link = `${base}/t/${token}`;

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
