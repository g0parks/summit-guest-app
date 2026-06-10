"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getActiveStay } from "@/lib/session";
import { notifyOperator } from "@/lib/notify";
import {
  computeChargeCents,
  confirmedRequestItineraryData,
  isFixedPrice,
} from "@/lib/catalog";

export type RequestResult =
  | { ok: true; status: "CONFIRMED" | "REQUESTED"; serviceName: string; chargedCents: number | null }
  | { ok: false; error: string };

/**
 * Guest requests a service.
 *  - Fixed-price → auto-confirm: drops a PENDING line on the tab (and, if dated,
 *    surfaces on the itinerary). The "watch it hit your tab" moment.
 *  - Quote-only → stays REQUESTED; the concierge prices it (out of scope here).
 * Either way the operator is notified.
 */
export async function createServiceRequest(
  _prev: RequestResult | null,
  formData: FormData,
): Promise<RequestResult> {
  const active = await getActiveStay();
  if (!active) {
    return { ok: false, error: "Your session has expired — please reopen your link." };
  }
  const { stay } = active;

  const serviceId = String(formData.get("serviceId") ?? "");
  const service = serviceId
    ? await prisma.service.findUnique({ where: { id: serviceId } })
    : null;
  if (!service || !service.isActive) {
    return { ok: false, error: "That service isn’t available right now." };
  }

  const dateStr = String(formData.get("date") ?? "").trim();
  const timeStr = String(formData.get("time") ?? "").trim();
  const partyRaw = String(formData.get("partySize") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (service.requiresDate && !dateStr) {
    return { ok: false, error: "Please choose a date." };
  }

  let requestedFor: Date | null = null;
  if (dateStr) {
    const d = new Date(`${dateStr}T${timeStr || "12:00"}`);
    if (!Number.isNaN(d.getTime())) requestedFor = d;
  }

  const parsedParty = partyRaw ? Number.parseInt(partyRaw, 10) : NaN;
  const partySize = Number.isFinite(parsedParty) ? parsedParty : stay.partySize ?? null;

  const confirmed = isFixedPrice(service.priceUnit, service.priceAmount);

  const request = await prisma.serviceRequest.create({
    data: {
      stayId: stay.id,
      serviceId: service.id,
      status: confirmed ? "CONFIRMED" : "REQUESTED",
      requestedFor,
      partySize: partySize ?? undefined,
      notes,
    },
  });

  let chargedCents: number | null = null;

  // Re-check inline so TS narrows priceAmount to a number in this block.
  if (isFixedPrice(service.priceUnit, service.priceAmount)) {
    chargedCents = computeChargeCents(
      service.priceUnit,
      service.priceAmount,
      partySize ?? 1,
    );

    await prisma.tabLineItem.create({
      data: {
        stayId: stay.id,
        serviceRequestId: request.id,
        description: service.name,
        amount: chargedCents,
        currency: stay.currency,
        status: "PENDING",
      },
    });

    // Confirmed + scheduled → it belongs on the trip timeline.
    if (requestedFor) {
      await prisma.itineraryItem.create({
        data: confirmedRequestItineraryData({
          stayId: stay.id,
          requestId: request.id,
          service,
          notes,
          startsAt: requestedFor,
        }),
      });
    }
  }

  await notifyOperator({
    type: "service_requested",
    stayId: stay.id,
    guestName: `${stay.guest.firstName} ${stay.guest.lastName ?? ""}`.trim(),
    property: stay.property.name,
    serviceName: service.name,
    requestId: request.id,
    requestedFor: requestedFor?.toISOString() ?? null,
    notes,
    isDemo: stay.isDemo,
    partnerName: stay.property.partner?.name ?? null,
  });

  // Refresh the surfaces this touched.
  revalidatePath("/");
  revalidatePath("/tab");
  revalidatePath("/itinerary");

  return {
    ok: true,
    status: confirmed ? "CONFIRMED" : "REQUESTED",
    serviceName: service.name,
    chargedCents,
  };
}
