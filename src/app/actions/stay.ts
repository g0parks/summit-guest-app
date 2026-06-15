"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getActiveStay } from "@/lib/session";

export type RentalCarResult = { ok: true } | { ok: false; error: string };

/**
 * In-app fallback for the rental-car parameter — for a guest who never ran
 * /plan. Token = identity (getActiveStay), so we only ever write the caller's
 * own stay; the value is never trusted from the client beyond the boolean.
 * Stored, not acted on in v1 — the distance-activity re-pricing is v2.
 */
export async function setStayRentalCar(value: boolean): Promise<RentalCarResult> {
  const active = await getActiveStay();
  if (!active) {
    return { ok: false, error: "Your session has expired — please reopen your link." };
  }

  await prisma.stay.update({
    where: { id: active.stay.id },
    data: { hasRentalCar: value },
  });

  revalidatePath("/");
  return { ok: true };
}
