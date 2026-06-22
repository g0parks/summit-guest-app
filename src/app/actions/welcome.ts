"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActiveStay } from "@/lib/session";

/**
 * Cross the threshold: stamp the welcome as seen (so the interstitial never
 * shows this stay again) and drop the guest on the app home. Idempotent — a
 * re-submit after it's set is a no-op. Session resolves from the cookie the
 * token route already set, so no args ride the form.
 */
export async function enterTrip(): Promise<void> {
  const active = await getActiveStay();
  if (active && active.stay.welcomeSeenAt == null) {
    await prisma.stay.update({
      where: { id: active.stay.id },
      data: { welcomeSeenAt: new Date() },
    });
  }
  redirect("/");
}
