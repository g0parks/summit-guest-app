import { PrismaClient } from "@prisma/client";
import { generateTokenId, buildToken } from "../src/lib/tokens";

// Mint a fresh access link for the most recent stay, without re-seeding.
try {
  process.loadEnvFile();
} catch {
  /* env may already be present */
}

const prisma = new PrismaClient();

async function main() {
  const stay = await prisma.stay.findFirst({
    orderBy: { createdAt: "desc" },
    include: { guest: true, property: true },
  });

  if (!stay) {
    console.error("No stay found. Run `npm run db:seed` first.");
    process.exit(1);
  }

  const tokenId = generateTokenId();
  await prisma.accessToken.create({
    data: { id: tokenId, stayId: stay.id, label: "manual mint" },
  });

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const link = `${base}/t/${buildToken(tokenId)}`;

  console.log(`\n  Fresh link for ${stay.guest.firstName} @ ${stay.property.name}:`);
  console.log(`  ${link}\n`);
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
