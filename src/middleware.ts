import { NextResponse, type NextRequest } from "next/server";

/**
 * Session-aware apex for the Aerie brand domain(s).
 *
 * The bare apex of an Aerie domain serves the product flyer — but ONLY to a
 * cold visitor. Once someone taps "Walk through a stay" (/demo sets the
 * summit_stay cookie and redirects to "/") or lands via a guest token, "/"
 * must fall through to the trip home instead. Otherwise the demo bounces
 * straight back to the flyer.
 *
 * This lives in middleware (not a next.config rewrite) because cookie-
 * conditional rewrites aren't reliably evaluated by the rewrite layer. The
 * matcher scopes this to "/" only, so nothing else (/demo, /t, /ops, /api…)
 * pays any cost. Non-Aerie hosts (the .vercel.app URL) always fall through.
 */
const AERIE_HOSTS = /^(aerie\.summitluxurylogistics\.com|(www\.)?aeriepc\.com)$/;

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (AERIE_HOSTS.test(host) && !req.cookies.get("summit_stay")) {
    return NextResponse.rewrite(new URL("/aerie.html", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: "/" };
