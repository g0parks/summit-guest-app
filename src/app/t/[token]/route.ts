import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resolveToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { addDays } from "@/lib/dates";
import { POST_STAY_ACCESS_DAYS } from "@/lib/stayPhase";

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
 * Validated in-app landing path for nudge deep links (?next=/requests/<id>):
 * RELATIVE only — never absolute, never protocol-relative — so a tampered
 * link can't bounce a guest off-site. Anything suspect falls back to "/".
 */
function safeNextPath(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}

/**
 * Token entry point: the unique per-guest link lands here.
 * Verify the signed token → set the session cookie → redirect to a clean
 * in-app path ("/" or a validated ?next=). The token never stays in the
 * address bar. UTM params (if any) are captured for attribution ONLY — they
 * are never the access key.
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

  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const res = NextResponse.redirect(new URL(next, req.url));
  // Session lives through the post-stay window (the recap + return-intent
  // moment); converted/manual tokens expire on the same clock, so after it
  // the link itself resolves to /invalid — a real ending.
  res.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(addDays(active.stay.departureDate, POST_STAY_ACCESS_DAYS)),
  );
  return res;
}
