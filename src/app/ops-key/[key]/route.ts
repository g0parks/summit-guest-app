import { NextResponse, type NextRequest } from "next/server";
import { isOperatorKey, OPS_COOKIE, opsCookieOptions } from "@/lib/opsSession";

/**
 * Operator entry point — the one door into /ops (mint the link with
 * `npm run ops:link`). Valid key → set the ops cookie → clean redirect to
 * /ops. Anything else → /invalid, same as a bad guest token.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;

  // Route params can arrive percent-encoded; a base64url OPS_KEY never
  // contains "%", so decoding is a harmless no-op in the common case.
  let candidate = key;
  try {
    candidate = decodeURIComponent(key);
  } catch {
    /* malformed encoding → compare raw, which will fail */
  }

  if (!isOperatorKey(candidate)) {
    return NextResponse.redirect(new URL("/invalid", req.url));
  }

  const res = NextResponse.redirect(new URL("/ops", req.url));
  res.cookies.set(OPS_COOKIE, candidate, opsCookieOptions());
  return res;
}
