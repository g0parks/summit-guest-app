import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/tokens";
import { OPS_COOKIE, opsCookieOptions } from "@/lib/opsSession";

/**
 * Magic-link landing: verify the signed, time-limited token from the email,
 * then set the ops cookie (value = OPS_KEY, so requireOperator is unchanged)
 * and enter /ops. Anything off — bad signature, wrong shape, expired — bounces
 * to /invalid, same as a bad key (never advertises that /ops exists).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  let raw = token;
  try {
    raw = decodeURIComponent(token);
  } catch {
    /* malformed encoding → verify raw, which will fail */
  }

  const id = verifyToken(raw); // "ops:<expiryMs>" or null
  const opsKey = process.env.OPS_KEY;
  const bounce = NextResponse.redirect(new URL("/invalid", req.url));
  if (!opsKey || !id || !id.startsWith("ops:")) return bounce;

  const expiry = Number(id.slice("ops:".length));
  if (!Number.isFinite(expiry) || Date.now() > expiry) return bounce; // expired

  const res = NextResponse.redirect(new URL("/ops", req.url));
  res.cookies.set(OPS_COOKIE, opsKey, opsCookieOptions());
  return res;
}
