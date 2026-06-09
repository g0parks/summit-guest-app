// Print the operator entry link — bookmark it on your phone.
// Rotation = change OPS_KEY (Vercel dashboard / .env) and re-run.
try {
  process.loadEnvFile();
} catch {
  /* env may already be present */
}

const key = process.env.OPS_KEY;
if (!key) {
  console.error(
    "OPS_KEY is not set — add a long random value to .env (see .env.example).",
  );
  process.exit(1);
}

const base = process.env.APP_BASE_URL ?? "http://localhost:3000";

console.log(`\n  Ops console link:`);
console.log(`  ${base}/ops-key/${encodeURIComponent(key)}\n`);
