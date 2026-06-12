"use server";

import { prisma } from "@/lib/db";
import { getActiveStay } from "@/lib/session";
import { notifyOperator } from "@/lib/notify";
import { getStayPhase } from "@/lib/stayPhase";
import { enrollIntakeSignals } from "@/lib/opsStay";
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

  // A POST_STAY session follows the return-intent convention (see
  // submitReturnIntent): link the guest, never the departed stay — the
  // conversion claim requires stayId: null, so this keeps the intake
  // convertible into the NEXT stay. The known-guest flow skips the contact
  // screen, so contact is backfilled from the Guest record; the operator
  // notification still deep-links the departed stay for context.
  const guest = active?.stay.guest ?? null;
  const postStay =
    active != null &&
    getStayPhase(active.stay, active.stay.property.timezone) === "POST_STAY";

  const intake = await prisma.tripIntake.create({
    data: {
      name:
        name ??
        (postStay && guest
          ? `${guest.firstName} ${guest.lastName ?? ""}`.trim()
          : null),
      email: email ?? (postStay ? guest?.email ?? null : null),
      phone: phone ?? (postStay ? guest?.phone ?? null : null),
      tripTiming,
      note,
      source,
      answersJson: answers,
      utmJson: utmJson ?? undefined,
      stayId: postStay ? null : active?.stay.id ?? null,
      guestId: active?.stay.guestId ?? null,
    },
  });

  // World A: interested answers enroll straight into the request lifecycle
  // as SIGNALED rows — the home checklist becomes the resumption surface.
  // World B has no stay yet; its signals enroll at conversion (opsStays.ts).
  // No revalidatePath (the submitStayForm precedent): IntakeFlow's close
  // screen must stay mounted, and every trip surface is force-dynamic.
  if (active && !postStay) {
    const interestedServiceSlugs = answers
      .filter((a) => a.answer === "interested")
      .map((a) => a.serviceSlug);
    await enrollIntakeSignals(prisma, active.stay, interestedServiceSlugs);
  }

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

/**
 * Post-stay "have us along next time" — the lifecycle loop. Token = identity:
 * requires a live session and asks ZERO contact fields (never ask what we
 * already know). Lands as a TripIntake with the guest linked but NO stayId —
 * the convertedAt claim requires stayId: null, so this row stays convertible
 * via the ops convert flow; the operator notification still deep-links the
 * departed stay for context.
 */
export async function submitReturnIntent(
  _prev: IntakeResult | null,
  formData: FormData,
): Promise<IntakeResult> {
  const active = await getActiveStay();
  if (!active) {
    return { ok: false, error: "Your session has expired — please reopen your link." };
  }
  const { stay } = active;

  const tripTiming = field(formData, "tripTiming", 200);

  const intake = await prisma.tripIntake.create({
    data: {
      name: `${stay.guest.firstName} ${stay.guest.lastName ?? ""}`.trim(),
      email: stay.guest.email,
      phone: stay.guest.phone,
      tripTiming,
      answersJson: [],
      source: "post-stay",
      guestId: stay.guestId,
    },
  });

  await notifyOperator({
    type: "trip_intake",
    intakeId: intake.id,
    name: stay.guest.firstName,
    email: stay.guest.email,
    phone: stay.guest.phone,
    tripTiming,
    interests: [],
    declined: [],
    note: null,
    source: "post-stay",
    stayId: stay.id,
    isDemo: stay.isDemo,
    partnerName: stay.property.partner?.name ?? null,
  });

  return { ok: true };
}
