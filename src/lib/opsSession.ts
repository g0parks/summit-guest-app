import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Ops console access — mirrors the guest-token pattern: no auth library, one
 * long unguessable secret (`OPS_KEY`) carried in an httpOnly cookie. Single
 * operator; rotation = change OPS_KEY in Vercel. Revisit if a second human
 * ever joins.
 */

export const OPS_COOKIE = "summit_ops";

export function opsCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90d
  };
}

/** Constant-time compare against OPS_KEY. Fails closed when OPS_KEY is unset. */
export function isOperatorKey(candidate: string | undefined | null): boolean {
  const key = process.env.OPS_KEY;
  if (!key || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(key);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Gate ops surfaces. Bounces to /invalid (the guest page) on failure — the
 * gate doesn't advertise that /ops exists.
 */
export async function requireOperator(): Promise<void> {
  const jar = await cookies();
  if (!isOperatorKey(jar.get(OPS_COOKIE)?.value)) redirect("/invalid");
}
