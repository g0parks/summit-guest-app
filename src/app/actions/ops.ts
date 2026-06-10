"use server";

import { revalidatePath } from "next/cache";
import type { PerkClaimStatus, RequestStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/opsSession";
import { getPaymentProvider } from "@/lib/payments";
import { confirmedRequestItineraryData } from "@/lib/catalog";
import { parseMoneyCents } from "@/lib/money";

/**
 * Operator fulfillment actions. Every action gates on requireOperator() and,
 * after mutating, revalidates BOTH surfaces the data feeds: the ops pages and
 * the guest pages ("/", "/tab", "/itinerary").
 */

export type OpsResult = { ok: true } | { ok: false; error: string };

function revalidateSurfaces(stayId: string) {
  revalidatePath("/ops");
  revalidatePath(`/ops/stays/${stayId}`);
  revalidatePath("/");
  revalidatePath("/tab");
  revalidatePath("/itinerary");
  revalidatePath("/perks");
}

/** amount - vendorCost - pmShare; net target 15–20% (drift shown in the UI). */
function computeNetCents(
  amountCents: number,
  vendorCostCents: number,
  pmShareCents: number,
): number {
  return amountCents - vendorCostCents - pmShareCents;
}

/**
 * Price a QUOTE request: set quotedAmount, confirm, drop the PENDING line on
 * the guest tab (with economics), and surface it on the itinerary if dated —
 * the same shape the auto-confirm path produces for fixed-price services.
 */
export async function quoteRequest(
  _prev: OpsResult | null,
  formData: FormData,
): Promise<OpsResult> {
  await requireOperator();

  const requestId = String(formData.get("requestId") ?? "");
  const amountCents = parseMoneyCents(String(formData.get("amount") ?? ""));
  const vendorRaw = String(formData.get("vendorCost") ?? "").trim();
  const vendorCostCents = vendorRaw ? parseMoneyCents(vendorRaw) : null;

  if (amountCents == null || amountCents <= 0) {
    return { ok: false, error: "Enter a quote amount in dollars." };
  }
  if (vendorRaw && vendorCostCents == null) {
    return { ok: false, error: "Vendor cost isn't a valid amount." };
  }

  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { service: true, stay: true },
  });
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "REQUESTED") {
    return { ok: false, error: "Only un-quoted requests can be quoted." };
  }

  await prisma.serviceRequest.update({
    where: { id: request.id },
    data: { quotedAmount: amountCents, status: "CONFIRMED" },
  });

  await prisma.tabLineItem.create({
    data: {
      stayId: request.stayId,
      serviceRequestId: request.id,
      description: request.service?.name ?? request.customTitle ?? "Concierge service",
      amount: amountCents,
      currency: request.stay.currency,
      status: "PENDING",
      vendorCostCents,
      pmShareCents: vendorCostCents != null ? 0 : null, // Phase-2: real PM share
      netCents:
        vendorCostCents != null
          ? computeNetCents(amountCents, vendorCostCents, 0)
          : null,
    },
  });

  if (request.requestedFor && request.service) {
    await prisma.itineraryItem.create({
      data: confirmedRequestItineraryData({
        stayId: request.stayId,
        requestId: request.id,
        service: request.service,
        notes: request.notes,
        startsAt: request.requestedFor,
      }),
    });
  }

  revalidateSurfaces(request.stayId);
  return { ok: true };
}

/** Operator-driven lifecycle moves, simple allowlist — no resurrection paths. */
const TRANSITIONS: Partial<Record<RequestStatus, RequestStatus[]>> = {
  REQUESTED: ["DECLINED", "CANCELLED"],
  CONFIRMED: ["SCHEDULED", "COMPLETED", "CANCELLED"],
  SCHEDULED: ["COMPLETED", "CANCELLED"],
};

const SETTABLE: RequestStatus[] = ["SCHEDULED", "COMPLETED", "DECLINED", "CANCELLED"];

/**
 * Move a request along its lifecycle. DECLINED / CANCELLED also voids linked
 * PENDING tab lines and removes the linked itinerary item, so the guest's tab
 * and timeline stay truthful.
 */
export async function setRequestStatus(formData: FormData): Promise<void> {
  await requireOperator();

  const requestId = String(formData.get("requestId") ?? "");
  const status = String(formData.get("status") ?? "") as RequestStatus;
  if (!SETTABLE.includes(status)) return;

  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { itineraryItem: true },
  });
  if (!request) return;
  if (!(TRANSITIONS[request.status] ?? []).includes(status)) return;

  await prisma.serviceRequest.update({ where: { id: request.id }, data: { status } });

  if (status === "DECLINED" || status === "CANCELLED") {
    await prisma.tabLineItem.updateMany({
      where: { serviceRequestId: request.id, status: "PENDING" },
      data: { status: "VOID" },
    });
    if (request.itineraryItem) {
      await prisma.itineraryItem.delete({ where: { id: request.itineraryItem.id } });
    }
  }

  revalidateSurfaces(request.stayId);
}

/**
 * Charge one PENDING line to the stay's card on file via the PaymentProvider
 * seam (mock today, Stripe later).
 */
export async function chargeTabLine(
  _prev: OpsResult | null,
  formData: FormData,
): Promise<OpsResult> {
  await requireOperator();

  const id = String(formData.get("tabLineItemId") ?? "");
  const line = await prisma.tabLineItem.findUnique({ where: { id } });
  if (!line) return { ok: false, error: "Line not found." };
  if (line.status !== "PENDING") {
    return { ok: false, error: "Only pending lines can be charged." };
  }

  const card =
    (await prisma.paymentMethod.findFirst({
      where: { stayId: line.stayId, isDefault: true },
    })) ??
    (await prisma.paymentMethod.findFirst({ where: { stayId: line.stayId } }));
  if (!card) return { ok: false, error: "No card on file for this stay." };

  const res = await getPaymentProvider().chargeService({
    stayId: line.stayId,
    amountCents: line.amount,
    currency: line.currency,
    description: line.description,
    paymentMethodExternalRef: card.externalRef,
  });

  await prisma.tabLineItem.update({
    where: { id: line.id },
    data: { status: "CHARGED", externalRef: res.externalRef, paymentMethodId: card.id },
  });

  revalidateSurfaces(line.stayId);
  return { ok: true };
}

/** Set / correct a line's internal economics; netCents recomputes on write. */
export async function setLineEconomics(formData: FormData): Promise<void> {
  await requireOperator();

  const id = String(formData.get("tabLineItemId") ?? "");
  const vendorCostCents = parseMoneyCents(String(formData.get("vendorCost") ?? ""));
  const pmShareRaw = String(formData.get("pmShare") ?? "").trim();
  const pmShareCents = pmShareRaw ? parseMoneyCents(pmShareRaw) : 0;
  if (vendorCostCents == null || pmShareCents == null) return;

  const line = await prisma.tabLineItem.findUnique({ where: { id } });
  if (!line) return;

  await prisma.tabLineItem.update({
    where: { id: line.id },
    data: {
      vendorCostCents,
      pmShareCents,
      netCents: computeNetCents(line.amount, vendorCostCents, pmShareCents),
    },
  });

  revalidateSurfaces(line.stayId);
}

/**
 * Resolve a perk claim: FULFILLED (arranged + delivered) or CANCELLED.
 * Perks never touch the tab, so there's nothing to void either way.
 */
export async function setPerkClaimStatus(formData: FormData): Promise<void> {
  await requireOperator();

  const claimId = String(formData.get("perkClaimId") ?? "");
  const status = String(formData.get("status") ?? "") as PerkClaimStatus;
  if (status !== "FULFILLED" && status !== "CANCELLED") return;

  const claim = await prisma.perkClaim.findUnique({ where: { id: claimId } });
  if (!claim || claim.status !== "CLAIMED") return;

  await prisma.perkClaim.update({ where: { id: claim.id }, data: { status } });

  revalidateSurfaces(claim.stayId);
}

/** Off-catalog item straight onto the tab — PENDING, no request linked. */
export async function addManualTabLine(formData: FormData): Promise<void> {
  await requireOperator();

  const stayId = String(formData.get("stayId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const amountCents = parseMoneyCents(String(formData.get("amount") ?? ""));
  const vendorRaw = String(formData.get("vendorCost") ?? "").trim();
  const vendorCostCents = vendorRaw ? parseMoneyCents(vendorRaw) : null;

  if (!stayId || !description || amountCents == null || amountCents === 0) return;
  if (vendorRaw && vendorCostCents == null) return;

  const stay = await prisma.stay.findUnique({ where: { id: stayId } });
  if (!stay) return;

  await prisma.tabLineItem.create({
    data: {
      stayId: stay.id,
      description,
      amount: amountCents,
      currency: stay.currency,
      status: "PENDING",
      vendorCostCents,
      pmShareCents: vendorCostCents != null ? 0 : null,
      netCents:
        vendorCostCents != null
          ? computeNetCents(amountCents, vendorCostCents, 0)
          : null,
    },
  });

  revalidateSurfaces(stay.id);
}
