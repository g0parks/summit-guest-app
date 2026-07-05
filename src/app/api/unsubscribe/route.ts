import { NextResponse } from "next/server";
import { parseUnsubscribeToken, recordEmailOptOut } from "@/lib/consent";

/**
 * RFC 8058 one-click unsubscribe — the List-Unsubscribe-Post target inbox
 * providers (Gmail, Yahoo) POST to when a user taps their native
 * unsubscribe button. Token rides the query string (set per-email in
 * guestEmail.ts). POST-only by design: a GET must never mutate, so link
 * scanners can't opt guests out.
 */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const guestId = parseUnsubscribeToken(token);
  if (!guestId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  await recordEmailOptOut(guestId);
  return NextResponse.json({ ok: true });
}
