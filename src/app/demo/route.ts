import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resolveToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { cleanupDemoStays, createDemoStay, DEMO_TTL_DAYS, SANDBOX_GUEST } from "@/lib/demoStay";

/**
 * Self-serve demo sandbox — the pitch URL and the post-pitch leave-behind.
 *
 * Every fresh visitor gets their OWN pristine demo trip (guest + property +
 * stay flagged isDemo), so two pitches never collide and a PM can explore
 * freely. A returning visitor with a live sandbox continues the same trip;
 * once it has "departed" (or the link names a different partner) they get a
 * fresh one.
 *
 * ?partner=<slug> renders that partner's co-brand — partners are pre-created
 * privately (`npm run partner:add`), NEVER from URL input. Unknown slug falls
 * back to the default (oldest active) partner quietly.
 *
 * Architecture note: the token model is untouched — the cookie still carries
 * a full signed token resolved server-side. This route is the one sanctioned
 * place minting is self-serve, and only for isDemo sandboxes.
 */
export async function GET(req: NextRequest) {
  // Lazy GC — never let cleanup failure block a pitch.
  try {
    const cleaned = await cleanupDemoStays(prisma);
    if (cleaned > 0) console.info(`[demo] cleaned up ${cleaned} expired sandbox(es)`);
  } catch (err) {
    console.error("[demo] cleanup failed:", err);
  }

  const requestedSlug = req.nextUrl.searchParams.get("partner");

  const active = await resolveToken(req.cookies.get(SESSION_COOKIE)?.value);

  // A REAL guest wandered onto the pitch URL — never clobber their session
  // cookie with a sandbox. Their trip is the only right destination.
  if (active && !active.stay.isDemo) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Returning visitor with a live sandbox for the same brand → continue it.
  if (active?.stay.isDemo) {
    const current = active.stay.departureDate.getTime() > Date.now();
    const sameBrand =
      !requestedSlug || active.stay.property.partner?.slug === requestedSlug;
    if (current && sameBrand) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Resolve the co-brand: requested slug → fallback to the default
  // (oldest active = the seeded demo partner).
  const partner =
    (requestedSlug
      ? await prisma.partner.findFirst({
          where: { slug: requestedSlug, isActive: true },
        })
      : null) ??
    (await prisma.partner.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    }));

  const { token } = await createDemoStay(prisma, {
    partnerId: partner?.id ?? null,
    isDemo: true,
    guest: SANDBOX_GUEST,
    tokenLabel: requestedSlug ? `demo sandbox · ${requestedSlug}` : "demo sandbox",
  });

  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(new Date(Date.now() + DEMO_TTL_DAYS * 24 * 60 * 60 * 1000)),
  );
  return res;
}
