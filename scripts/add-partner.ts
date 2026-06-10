import { PrismaClient } from "@prisma/client";

// Pre-create (or update) a partner for a pitch, then share the demo URL.
// Partners are NEVER created from URL input — this script is the one door.
//
//   $env:PARTNER_NAME = "Luxury Park City Rentals"
//   $env:PARTNER_ACCENT = "#335577"        # optional
//   $env:PARTNER_LOGO_URL = "https://..."  # optional
//   $env:PARTNER_LABEL = "..."             # optional conciergeLabel override
//   npm run partner:add
//
// NOTE: `npm run db:seed` wipes ALL partners — re-run this after a reseed.
try {
  process.loadEnvFile();
} catch {
  /* env may already be present */
}

const prisma = new PrismaClient();

async function main() {
  const name = process.env.PARTNER_NAME?.trim();
  if (!name) {
    console.error('PARTNER_NAME is required — e.g. $env:PARTNER_NAME = "Luxury Park City Rentals"; npm run partner:add');
    process.exit(1);
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const accentColor = process.env.PARTNER_ACCENT?.trim() || null;
  const logoUrl = process.env.PARTNER_LOGO_URL?.trim() || null;
  const conciergeLabel = process.env.PARTNER_LABEL?.trim() || null;

  const partner = await prisma.partner.upsert({
    where: { slug },
    create: { slug, name, accentColor, logoUrl, conciergeLabel },
    update: { name, accentColor, logoUrl, conciergeLabel, isActive: true },
  });

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";

  console.log(`\n  Partner ready: ${partner.name}`);
  console.log(`  Accent: ${partner.accentColor ?? "(Summit default)"} · Logo: ${partner.logoUrl ?? "(text wordmark)"}`);
  console.log("\n  ── Pitch URL ──────────────────────────────────────────");
  console.log(`  ${base}/demo?partner=${partner.slug}`);
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
