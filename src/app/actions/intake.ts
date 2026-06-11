"use server";

import { prisma } from "@/lib/db";
import { getActiveStay } from "@/lib/session";
import { notifyOperator } from "@/lib/notify";
import {
  INTAKE_QUESTIONS,
  interestedLabels,
  type IntakeAnswer,
} from "@/lib/intakeFlow";

export type IntakeResult = { ok: true } | { ok: false; error: string };

/** Trim + cap a free-text field; empty → null. */
function field(formData: FormData, name: string, max: number): string | null {
  return String(formData.get(name) ?? "").trim().slice(0, max) || null;
}

/**
 * Persist a completed /plan intake — one write at the end of the flow, no
 * partial rows. Everything is optional by design (skipping everything still
 * ends warmly); the operator notification makes signal strength legible.
 * A known-guest session (World A) links the intake to its stay server-side —
 * never trusted from the client.
 */
export async function submitTripIntake(
  _prev: IntakeResult | null,
  formData: FormData,
): Promise<IntakeResult> {
  // Answers arrive as answer_<key>=interested|declined; skipped keys absent.
  const answers: IntakeAnswer[] = [];
  for (const q of INTAKE_QUESTIONS) {
    const v = String(formData.get(`answer_${q.key}`) ?? "");
    if (v === "interested" || v === "declined") {
      answers.push({ key: q.key, question: q.question, answer: v, serviceSlug: q.serviceSlug });
    }
  }

  // "No thanks — just looking" submits the same form; honor the intent and
  // drop anything typed into the contact fields.
  const skippedContact = String(formData.get("contactMode") ?? "") === "skip";

  const name = skippedContact ? null : field(formData, "name", 200);
  const email = skippedContact ? null : field(formData, "email", 320);
  const phone = skippedContact ? null : field(formData, "phone", 50);
  const tripTiming = skippedContact ? null : field(formData, "tripTiming", 200);
  const note = field(formData, "note", 4000);
  const source = field(formData, "source", 100);

  // Attribution only, never access (the AccessToken.utmJson rule).
  let utmJson: Record<string, string> | null = null;
  try {
    const parsed: unknown = JSON.parse(String(formData.get("utm") ?? "null"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      utmJson = Object.fromEntries(
        Object.entries(parsed)
          .filter(([k, v]) => k.startsWith("utm_") && typeof v === "string")
          .slice(0, 10)
          .map(([k, v]) => [k.slice(0, 100), String(v).slice(0, 300)]),
      );
      if (Object.keys(utmJson).length === 0) utmJson = null;
    }
  } catch {
    utmJson = null;
  }

  const active = await getActiveStay();

  const intake = await prisma.tripIntake.create({
    data: {
      name,
      email,
      phone,
      tripTiming,
      note,
      source,
      answersJson: answers,
      utmJson: utmJson ?? undefined,
      stayId: active?.stay.id ?? null,
      guestId: active?.stay.guestId ?? null,
    },
  });

  const interests = interestedLabels(answers);
  const declined = answers
    .filter((a) => a.answer === "declined")
    .map((a) => INTAKE_QUESTIONS.find((q) => q.key === a.key)?.interestLabel ?? a.key);

  await notifyOperator({
    type: "trip_intake",
    intakeId: intake.id,
    name: name ?? (active ? active.stay.guest.firstName : null),
    email,
    phone,
    tripTiming,
    interests,
    declined,
    note,
    source,
    stayId: active?.stay.id ?? null,
    isDemo: active?.stay.isDemo ?? false,
    partnerName: active?.stay.property.partner?.name ?? null,
  });

  return { ok: true };
}
