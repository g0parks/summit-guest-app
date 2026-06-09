import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resolveToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { addDays } from "@/lib/dates";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
] as const;

function extractUtm(params: URLSearchParams): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Token entry point: the unique per-guest link lands here.
 * Verify the signed token → set the session cookie → redirect to a clean "/".
 * The token never stays in the address bar. UTM params (if any) are captured
 * for attribution ONLY — they are never the access key.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const active = await resolveToken(token);

  if (!active) {
    return NextResponse.redirect(new URL("/invalid", req.url));
  }

  const utm = extractUtm(req.nextUrl.searchParams);
  await prisma.accessToken.update({
    where: { id: active.id },
    data: {
      lastAccessedAt: new Date(),
      // first-touch only — don't overwrite an existing attribution
      ...(utm && !active.utmJson ? { utmJson: utm } : {}),
    },
  });

  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(addDays(active.stay.departureDate, 2)),
  );
  return res;
}
