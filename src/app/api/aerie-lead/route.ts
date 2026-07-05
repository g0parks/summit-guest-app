import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notifyOperator } from "@/lib/notify";

/**
 * Public lead capture behind the Aerie flyer's "Get in touch" form.
 *
 * Unlike the /demo pop-up (captureDemoLead), there's no session here — it's a
 * cold PM prospect raising a hand from the marketing page, which makes it the
 * HIGHER-intent lead. Stored free-floating in TripIntake (no stay/guest, like
 * the demo lead) and pinged to the operator as an inquiry.
 *
 * A hidden honeypot field ("website") screens basic bots: if it's filled we ack
 * success and store nothing.
 */
function str(v: unknown, max: number): string | null {
  return typeof v === "string" ? v.trim().slice(0, max) || null : null;
}

/**
 * Best-effort per-IP throttle: 5 submissions per 10 minutes. In-memory, so
 * each serverless instance keeps its own window — with Fluid Compute reusing
 * instances this dampens a burst well, and that's the whole job (the
 * honeypot handles dumb bots; this stops a flood from hammering the DB and
 * the operator inbox). Deliberately no Redis: infra stays minimal, and a
 * distributed limiter isn't warranted for a marketing form.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recentByIp = new Map<string, number[]>();

function throttled(ip: string, now = Date.now()): boolean {
  const hits = (recentByIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    recentByIp.set(ip, hits);
    return true;
  }
  hits.push(now);
  recentByIp.set(ip, hits);
  // Keep the map from growing unbounded across a long-lived instance.
  if (recentByIp.size > 1000) {
    for (const [k, v] of recentByIp) {
      if (v.every((t) => now - t >= WINDOW_MS)) recentByIp.delete(k);
    }
  }
  return false;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (throttled(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests — please try again in a few minutes." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  // Honeypot tripped — a bot filled the hidden field. Ack success, store nothing.
  if (str(body.website, 200)) return NextResponse.json({ ok: true });

  const name = str(body.name, 120);
  const email = str(body.email, 320);
  const phone = str(body.phone, 50);
  const company = str(body.company, 160);

  if (!email && !phone) {
    return NextResponse.json(
      { ok: false, error: "Add an email or phone so we can reach you." },
      { status: 400 },
    );
  }

  try {
    await prisma.tripIntake.create({
      data: {
        name,
        email,
        phone,
        answersJson: [],
        source: "aerie-contact",
        note: company ? `Aerie contact — ${company}` : "Aerie contact form",
      },
    });

    await notifyOperator({ type: "aerie_contact", name, email, phone, company });
  } catch (err) {
    console.error("[aerie-lead] capture failed:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong — please email info@summitluxurylogistics.com." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
