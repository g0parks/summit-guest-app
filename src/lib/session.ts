import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { verifyToken } from "./tokens";

/**
 * The cookie stores the FULL signed token ("<id>.<hmac>"), never a bare stayId.
 * Every read re-verifies the HMAC before resolving — editing the cookie to point
 * at another stay breaks the signature, so a guest can only ever resolve their own.
 */
export const SESSION_COOKIE = "summit_stay";

export type ActiveStay = Prisma.AccessTokenGetPayload<{
  include: { stay: { include: { guest: true; property: true } } };
}>;

export function sessionCookieOptions(until?: Date) {
  const maxAge = until
    ? Math.max(60, Math.floor((until.getTime() - Date.now()) / 1000))
    : 60 * 60 * 24 * 30; // 30d fallback
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Cryptographically verify a token string, then resolve it to a live Stay. */
export async function resolveToken(
  token: string | undefined | null,
): Promise<ActiveStay | null> {
  const id = verifyToken(token);
  if (!id) return null;

  const at = await prisma.accessToken.findUnique({
    where: { id },
    include: { stay: { include: { guest: true, property: true } } },
  });
  if (!at) return null;
  if (at.revokedAt) return null;
  if (at.expiresAt && at.expiresAt.getTime() < Date.now()) return null;

  return at;
}

/** Resolve the current guest from the session cookie (or null). */
export async function getActiveStay(): Promise<ActiveStay | null> {
  const jar = await cookies();
  return resolveToken(jar.get(SESSION_COOKIE)?.value);
}

/** Gate a page on a valid session — otherwise bounce to /invalid. */
export async function requireStay(): Promise<ActiveStay> {
  const active = await getActiveStay();
  if (!active) redirect("/invalid");
  return active;
}

export async function setStaySession(token: string, until?: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(until));
}

export async function clearStaySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
