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
  await prisma.guestTouch.deleteMany();
  await prisma.changeRequest.deleteMany();
  await prisma.perkClaim.deleteMany();
  await prisma.tabLineItem.deleteMany();
  await prisma.itineraryItem.deleteMany();
  await prisma.serviceRequest.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.accessToken.deleteMany();
  await prisma.tripIntake.deleteMany();
  await prisma.stay.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.service.deleteMany();
  await prisma.property.deleteMany();
  await prisma.perk.deleteMany();
  await prisma.partner.deleteMany();
}

const CATALOG = [
  // ── L1 essentials — the demand-router core. Lead with these. ──
  // Seasons pick the menu (stay dates decide; src/lib/stayPhase.ts).
  // Cutoffs power per-service changeability: free until X, then concierge.
  {
    slug: "airport-transfer-slc",
    name: "Airport Transfer — SLC",
    category: "TRANSPORT" as const,
    shortDesc: "Private black-car transfer between Salt Lake City and your residence.",
    priceAmount: 38000,
    priceUnit: "FLAT" as const,
    priceNote: null,
    leadTimeHours: 12,
    season: "ALL_YEAR" as const,
    moveCutoffHours: 24,
    cancelCutoffHours: 24,
    requiresDate: true,
    requiresTime: true,
    requiresPartySize: true, // vehicle sizing — we pick the car, never the guest
    sortOrder: 10,
  },
  {
    slug: "ski-rental",
    name: "Ski Rental Delivery",
    category: "ACTIVITY" as const,
    shortDesc: "Premium skis or boards, fitted at the residence and waiting in the mudroom.",
    longDesc:
      "A few details per rider and our technicians fit premium gear and deliver it to the residence before you arrive. Swap skis for a board, or anything that isn't working, anytime during your stay, no shop visit.",
    priceAmount: 8500,
    priceUnit: "PER_PERSON" as const,
    priceNote: "per day",
    leadTimeHours: 48,
    season: "WINTER" as const,
    moveCutoffHours: 48,
    cancelCutoffHours: 48,
    requiresDate: true,
    requiresTime: false,
    requiresPartySize: true,
    sortOrder: 10,
  },
  {
    slug: "bike-rental",
    name: "Bike Rental Delivery",
    category: "ACTIVITY" as const,
    shortDesc: "Mountain, road, or e-bikes, sized and delivered to the residence.",
    longDesc:
      "Tell us who's riding and our technicians size the right bikes and have them waiting at the residence, trail maps included, swaps anytime.",
    priceAmount: 8500,
    priceUnit: "PER_PERSON" as const,
    priceNote: "per day",
    leadTimeHours: 48,
    season: "SUMMER" as const,
    moveCutoffHours: 48,
    cancelCutoffHours: 48,
    requiresDate: true,
    requiresTime: false,
    requiresPartySize: true,
    sortOrder: 10,
  },
  {
    slug: "guided-fly-fishing",
    name: "Guided Fly-Fishing — Provo River",
    category: "ACTIVITY" as const,
    shortDesc: "A half-day on a blue-ribbon river with a local guide, all gear included.",
    priceAmount: 29500,
    priceUnit: "PER_PERSON" as const,
    priceNote: null,
    leadTimeHours: 48,
    season: "SUMMER" as const,
    moveCutoffHours: 72,
    cancelCutoffHours: 72,
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
    season: "SUMMER" as const,
    moveCutoffHours: 72,
    cancelCutoffHours: 72,
    requiresDate: true,
    requiresTime: true,
    requiresPartySize: true,
    sortOrder: 30,
  },
  {
    slug: "private-ski-guide",
    name: "Private Ski Guide",
    category: "ACTIVITY" as const,
    shortDesc: "A certified guide for the day. First tracks, hidden stashes, no lift lines.",
    priceAmount: 95000,
    priceUnit: "PER_DAY" as const,
    priceNote: null,
    leadTimeHours: 24,
    season: "WINTER" as const,
    moveCutoffHours: 72,
    cancelCutoffHours: 72,
    requiresDate: true,
    requiresTime: false,
    requiresPartySize: true,
    sortOrder: 50,
  },
  {
    // Provisioning fee-structure (WS2, src/lib/provisioningPricing.ts):
    // FEE_STRUCTURE + null amount completes the wizard to READY (the guest
    // consented to the disclosed cost-plus schedule — no quote, no approve-a-
    // total step); the operator prices the shopped order (cost + fees) and it
    // moves to CONFIRMED. Fee knobs below are tunable per service.
    slug: "grocery-pre-stock",
    name: "Grocery Pre-Stock",
    category: "PROVISIONING" as const,
    shortDesc: "Arrive to a stocked kitchen, your list shopped and put away before you walk in.",
    longDesc:
      "Pick a stocking style, tell us about the table, and we'll have the kitchen and pantry put away before you walk in. You pay for the groceries, plus a delivery and service fee.",
    priceAmount: null,
    priceUnit: "FEE_STRUCTURE" as const,
    priceNote: "Priced to your order",
    deliveryFeeCents: 5000, // $50 — see PROVISIONING_FEE_DEFAULTS
    serviceFeeBps: 2500, // 25%
    rushFeeCents: 10000, // $100 same-day / late-order rush
    leadTimeHours: 48,
    season: "ALL_YEAR" as const,
    moveCutoffHours: 48,
    cancelCutoffHours: 48,
    requiresDate: true,
    requiresTime: false,
    requiresPartySize: false,
    sortOrder: 10,
  },
  {
    // The bar as DISCOVERY (Alcohol spec 2026-06-15). Provisioning fee-structure
    // (WS2, src/lib/provisioningPricing.ts): FEE_STRUCTURE + null amount
    // completes the wizard to READY (the guest consented to the disclosed
    // schedule — no quote, no second tap); the operator prices the curated
    // order (bottle cost + fees) and it moves to CONFIRMED. Moments are seeded
    // by trip signals; a human curates the bottles. No date — pre-arrival rides
    // the grocery put-away, same-day is a separate run derived from the cutoff.
    // DABS Sunday gate is alcohol-only (closedDaysForService).
    slug: "bar-stocking",
    isActive: false, // pulled 2026-06-25 — Utah alcohol law (Summit can't supply alcohol)
    name: "Bar Stocking",
    category: "PROVISIONING" as const,
    shortDesc: "Wine and spirits, stocked to your taste before you arrive.",
    longDesc:
      "Tell us how you like to drink, and the bar is stocked to your taste and put away before you arrive. The bottles, plus a delivery and service fee, ride your tab.",
    priceAmount: null,
    priceUnit: "FEE_STRUCTURE" as const,
    priceNote: "Priced to your order",
    deliveryFeeCents: 5000, // $50 — matches grocery (Parker, 2026-06-19)
    serviceFeeBps: 2500, // 25%
    rushFeeCents: 10000, // $100 same-day / late-order rush
    leadTimeHours: 24,
    season: "ALL_YEAR" as const,
    moveCutoffHours: null, // alcohol changes go through the concierge (by doctrine)
    cancelCutoffHours: null,
    requiresDate: false,
    requiresTime: false,
    requiresPartySize: false,
    sortOrder: 20,
  },
  // ── Elevated (L2) — relationship heat, not the margin core. ──
  {
    slug: "in-residence-massage",
    name: "In-Residence Massage",
    category: "WELLNESS" as const,
    shortDesc: "A licensed therapist brings the spa to you, table and oils included.",
    priceAmount: 22000,
    priceUnit: "PER_PERSON" as const,
    priceNote: null,
    leadTimeHours: 24,
    season: "ALL_YEAR" as const,
    moveCutoffHours: null,
    cancelCutoffHours: null,
    requiresDate: true,
    requiresTime: true,
    requiresPartySize: true,
    sortOrder: 10,
  },
  {
    // QUOTE by doctrine (Parker, 2026-06-12): a chef night is priced to the
    // table, never auto-billed — the guest approves the quote in-app.
    slug: "private-chef-dinner",
    name: "Private Chef Dinner",
    category: "DINING" as const,
    shortDesc: "A bespoke multi-course dinner, cooked and served in your residence.",
    longDesc:
      "One of our private chefs designs a menu around your tastes, sources locally, and handles everything from mise en place to the final plate, and the cleanup. You simply sit down to dinner.",
    priceAmount: null,
    priceUnit: "QUOTE" as const,
    priceNote: "from $850",
    leadTimeHours: 72,
    season: "ALL_YEAR" as const,
    moveCutoffHours: 72,
    cancelCutoffHours: 72,
    requiresDate: true,
    requiresTime: true,
    requiresPartySize: true,
    sortOrder: 10,
  },
  {
    slug: "sommelier-wine-pairing",
    isActive: false, // pulled 2026-06-25 — Utah alcohol law (Summit can't supply alcohol)
    name: "Sommelier Wine Pairing",
    category: "DINING" as const,
    shortDesc: "A curated cellar selection paired to your dinner by a master sommelier.",
    priceAmount: 45000,
    priceUnit: "FLAT" as const,
    priceNote: "from",
    leadTimeHours: 48,
    season: "ALL_YEAR" as const,
    moveCutoffHours: null,
    cancelCutoffHours: null,
    requiresDate: true,
    requiresTime: true,
    requiresPartySize: false,
    sortOrder: 20,
  },
  {
    slug: "daily-housekeeping",
    name: "Daily Housekeeping",
    category: "HOUSEHOLD" as const,
    shortDesc: "A discreet midday refresh. Beds, towels, tidied and reset.",
    priceAmount: 18000,
    priceUnit: "FLAT" as const,
    priceNote: null,
    leadTimeHours: 12,
    season: "ALL_YEAR" as const,
    moveCutoffHours: null,
    cancelCutoffHours: null,
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
    season: "WINTER" as const,
    moveCutoffHours: 72,
    cancelCutoffHours: 72,
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
  // guest- or PM-facing. Register: "with our compliments" — never "exclusive",
  // never "FREE!", and no dollar-value framing on anything guest-facing.
  await prisma.perk.createMany({
    data: [
      {
        slug: "private-sauna-hour",
        name: "Private Sauna Hour",
        vendorName: "Avanto",
        shortDesc:
          "A private sauna hour for your group, cedar heat and a cold plunge, any evening of your stay.",
        longDesc:
          "An hour of private sauna for your whole group at Avanto: cedar heat, cold plunge, towels and cold rinse included, any evening during your stay. Claim it and we'll hold the slot until you pick a night.",
        costCents: null, // internal qualified-CAC — unknown until vendor terms are set
        partnerId: null, // available across all partners
        sortOrder: 10,
      },
      {
        slug: "silver-mountain-day-pass",
        name: "Silver Mountain Sports Club Day Pass",
        vendorName: "Silver Mountain Sports Club & Spa",
        shortDesc:
          "A full day at Park City's club in Prospector. Lap pools, hot tubs, weight room, classes, steam, and sauna.",
        longDesc:
          "A day to yourselves at Silver Mountain Sports Club & Spa, minutes away in Prospector: heated lap pools, indoor and outdoor hot tubs, a 5,000-square-foot weight room, yoga, Pilates, and spin classes, steam rooms and a dry sauna, plus a waterslide and lazy river if the kids are along. Your passes are with our compliments; claim them and we'll have the front desk expecting you.",
        costCents: null, // internal qualified-CAC — unknown until vendor terms are set
        partnerId: null,
        sortOrder: 20,
      },
      {
        slug: "upgrade-labs-recovery",
        name: "Upgrade Labs Recovery Session",
        vendorName: "Upgrade Labs",
        shortDesc:
          "One session at Park City's performance-recovery lab. Whole-body cryotherapy, red light, or compression, your pick.",
        longDesc:
          "Upgrade Labs in Kimball Junction puts professional-grade recovery in one room: three-minute whole-body cryotherapy, the REDcharger red-light bed, PEMF, and lymphatic compression. The fastest way we know to undo a ski day. Your first session is with our compliments; claim it, tell us which one sounds right, and we'll set the appointment.",
        costCents: null, // internal qualified-CAC — unknown until vendor terms are set
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

  // One sample World-B intake (anonymous /plan lead) so the ops convert flow
  // is testable immediately after a reseed.
  await prisma.tripIntake.create({
    data: {
      name: "Jordan Whitfield",
      email: "jordan.whitfield@example.com",
      phone: "+1 (310) 555-0148",
      tripTiming: "mid-February, presidents' week",
      answersJson: [
        {
          key: "airport-car",
          question: "Should we have a car waiting when you land at SLC?",
          answer: "interested",
          serviceSlug: "airport-transfer-slc",
        },
        {
          key: "kitchen",
          question: "Arriving to a stocked kitchen, or planning to shop?",
          answer: "interested",
          serviceSlug: "grocery-pre-stock",
        },
        {
          key: "chef",
          question:
            "Most guests do at least one dinner in-residence. Want us to hold a chef for a night?",
          answer: "declined",
          serviceSlug: "private-chef-dinner",
        },
      ],
      note: "Two kids (8 and 11) — gentle ski school mornings, and we'd love one adults-only dinner out if you can swing a sitter recommendation.",
      source: "email",
    },
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
