"use server";

import { prisma } from "@/lib/db";
import { getActiveStay } from "@/lib/session";
import { notifyOperator } from "@/lib/notify";

export type DemoLeadResult = { ok: true } | { ok: false; error: string };

function clean(v: FormDataEntryValue | null, max: number): string | null {
  return String(v ?? "").trim().slice(0, max) || null;
}

/**
 * Capture a prospect's contact from the /demo sandbox — the PM-facing lead
 * vector behind the flyer's "Walk through a stay" CTA.
 *
 * DEMO-ONLY by design: a real guest must NEVER be harvested as a sales lead,
 * so this no-ops on any non-demo stay. The lead is stored FREE-FLOATING in the
 * TripIntake lead table (stayId/guestId null, source-tagged) so it OUTLIVES the
 * throwaway sandbox — cleanupDemoStays deletes the stay/guest but not intakes,
 * and a lead linked to a doomed stay would either block GC or vanish. The live
 * operator ping carries the partner co-brand the prospect was viewing.
 */
export async function captureDemoLead(
  _prev: DemoLeadResult | null,
  formData: FormData,
): Promise<DemoLeadResult> {
  const active = await getActiveStay();
  if (!active || !active.stay.isDemo) {
    return { ok: false, error: "Not available here." };
  }

  const email = clean(formData.get("email"), 320);
  const phone = clean(formData.get("phone"), 50);
  if (!email && !phone) {
    return { ok: false, error: "Add an email or phone so we can reach you." };
  }

  const partner = active.stay.property.partner?.name ?? null;

  await prisma.tripIntake.create({
    data: {
      email,
      phone,
      answersJson: [],
      source: "demo-lead",
      note: partner ? `Demo lead — viewing ${partner} co-brand` : "Demo lead",
    },
  });

  await notifyOperator({
    type: "demo_lead",
    name: null,
    email,
    phone,
    note: partner ? `Viewing ${partner} co-brand` : null,
    stayId: active.stay.id,
    isDemo: true,
    partnerName: partner,
  });

  return { ok: true };
}
