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

export async function POST(req: Request) {
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
