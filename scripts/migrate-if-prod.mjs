// Apply Prisma migrations ONLY on a production Vercel build.
//
// Why this exists: the build used to run `prisma migrate deploy` unconditionally,
// and Vercel hands PREVIEW builds the same DATABASE_URL/DIRECT_URL as production —
// so pushing a branch applied its migrations to the PROD database before the PR was
// even opened, while prod was still serving the old code. The env vars are being
// scoped per-environment (the real fix); this is the belt that survives env drift.
//
// Consequences, by design:
//   • local `npm run build` no longer touches any database — use `npm run db:migrate`
//   • preview deploys no longer migrate anything, so a preview of a branch whose
//     migration hasn't been applied to summit-dev will throw Prisma column errors
//     until `npm run db:migrate` runs against dev
import { spawnSync } from "node:child_process";

const env = process.env.VERCEL_ENV;

if (env !== "production") {
  console.log(
    `[migrate] skipping prisma migrate deploy (VERCEL_ENV=${env ?? "unset"}) — ` +
      `only production builds migrate. Local: npm run db:migrate`,
  );
  process.exit(0);
}

console.log("[migrate] production build — applying migrations");
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
