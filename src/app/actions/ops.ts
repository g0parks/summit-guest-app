"use server";

import { revalidatePath } from "next/cache";
import { ItineraryCategory, type PerkClaimStatus, type RequestStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/opsSession";
import { getPaymentProvider } from "@/lib/payments";
import { isFixedPrice } from "@/lib/catalog";
import { parseMoneyCents } from "@/lib/money";
import { withVendorCostNote } from "@/lib/vendorNote";
import { zonedDateTime } from "@/lib/dates";
import { parseRequestDetails } from "@/lib/serviceForm";
import {
  computeFeeStructureChargeCents,
  isFeeStructureService,
  resolveFeeConfig,
  rushFromLabel,
} from "@/lib/provisioningPricing";

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
 * Price a QUOTE request: set quotedAmount and park it at QUOTED for the
 * guest's in-app approval tap. NO tab line, NO itinerary item here — those
 * are created by the guest's approveQuote (src/app/actions/requests.ts);
 * nothing lands on the tab the guest hasn't said yes to. Vendor cost rides
 * the operator note (src/lib/vendorNote.ts) until the line exists.
 * Fixed-price services NEVER pass through QUOTED — they auto-confirm on
 * wizard completion (the two pricing paths, never conflated).
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
    include: { service: true },
  });
  if (!request) return { ok: false, error: "Request not found." };
  // READY takes a first quote; QUOTED takes a RE-quote (typo fixes, vendor
  // came back different) — replaceable right up until the guest approves.
  if (request.status !== "READY" && request.status !== "QUOTED") {
    return { ok: false, error: "Only requests awaiting routing or approval can be quoted." };
  }
  if (request.service && isFixedPrice(request.service.priceUnit, request.service.priceAmount)) {
    return {
      ok: false,
      error: "Fixed-price services confirm on completion — nothing to quote.",
    };
  }
  // Fee-structure (grocery + bar) orders are priced with priceProvisioningOrder,
  // not quoted: the guest approved the disclosed SCHEDULE on completion, so they
  // must never be routed to the QUOTED re-approval surface. (The UI already
  // renders ProvisioningPriceForm, not QuoteForm, for these — this is the
  // symmetric server guard, mirroring priceProvisioningOrder's rejection.)
  if (isFeeStructureService(request.service?.priceUnit)) {
    return {
      ok: false,
      error:
        "Provisioning orders are priced with the provisioning form — the guest approved the schedule, not a total.",
    };
  }

  // Guarded write: if the guest's approval tap lands between the read above
  // and this update, the request is CONFIRMED with a tab line — re-quoting
  // it back to QUOTED would orphan that line. Only an open status moves.
  const moved = await prisma.serviceRequest.updateMany({
    where: { id: request.id, status: { in: ["READY", "QUOTED"] } },
    data: {
      quotedAmount: amountCents,
      status: "QUOTED",
      ...(vendorCostCents != null
        ? { operatorNote: withVendorCostNote(request.operatorNote, vendorCostCents) }
        : {}),
    },
  });
  if (moved.count === 0) {
    return { ok: false, error: "The guest just approved this one — nothing to re-quote." };
  }

  revalidateSurfaces(request.stayId);
  return { ok: true };
}

/**
 * Price a fee-structure (grocery + bar) order. The guest already approved the
 * disclosed fee SCHEDULE on completion — no quote-wait, no second approval tap
 * — so this is the operator curating/shopping the order and entering its
 * pass-through cost. The charge = cost + the disclosed fees (the service's
 * tunable config), computed against the order-time rush state stored on the
 * request (src/lib/provisioningPricing.ts). Creates the tab line (pass-through
 * cost = vendor cost, the fees = net) and moves READY → CONFIRMED. The Stripe
 * off-session charge drops in here later, behind the schedule-consent seam.
 * Fixed/QUOTE services never reach this path.
 */
export async function priceProvisioningOrder(
  _prev: OpsResult | null,
  formData: FormData,
): Promise<OpsResult> {
  await requireOperator();

  const requestId = String(formData.get("requestId") ?? "");
  const costCents = parseMoneyCents(String(formData.get("cost") ?? ""));
  if (costCents == null || costCents <= 0) {
    return { ok: false, error: "Enter the order cost in dollars." };
  }

  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { service: true, stay: { select: { currency: true } } },
  });
  if (!request) return { ok: false, error: "Request not found." };
  const service = request.service;
  if (!service || !isFeeStructureService(service.priceUnit)) {
    return { ok: false, error: "This isn't a provisioning order." };
  }
  if (request.status !== "READY") {
    return { ok: false, error: "Only an order awaiting pricing can be priced." };
  }

  const rush = rushFromLabel(
    parseRequestDetails(request.detailsJson).find((d) => d.name === "rush")?.value,
  );
  const amountCents = computeFeeStructureChargeCents(costCents, {
    ...resolveFeeConfig(service),
    rush,
  });

  // Guarded transition — one updateMany wins the move out of READY, so a
  // double submit can't stack two tab lines.
  const moved = await prisma.serviceRequest.updateMany({
    where: { id: request.id, status: "READY" },
    data: { status: "CONFIRMED" },
  });
  if (moved.count === 0) {
    return { ok: false, error: "This one's already been priced." };
  }

  await prisma.tabLineItem.create({
    data: {
      stayId: request.stayId,
      serviceRequestId: request.id,
      description: service.name,
      amount: amountCents,
      currency: request.stay.currency,
      status: "PENDING",
      // Pass-through cost IS the vendor cost; the fees are the net.
      vendorCostCents: costCents,
      pmShareCents: 0,
      netCents: computeNetCents(amountCents, costCents, 0),
    },
  });

  revalidateSurfaces(request.stayId);
  return { ok: true };
}

/** Operator-driven lifecycle moves, simple allowlist — no resurrection paths.
 *  EXPIRED is sweep-only (never operator-set); guest moves (complete, approve)
 *  live in the guest actions, not here. */
const TRANSITIONS: Partial<Record<RequestStatus, RequestStatus[]>> = {
  SIGNALED: ["DECLINED", "CANCELLED"],
  READY: ["DECLINED", "CANCELLED"],
  QUOTED: ["DECLINED", "CANCELLED"],
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
      // Change rows reference the item with a required FK (no cascade) —
      // delete them first or the item delete throws. The CANCELLED request
      // itself remains the demand record (the demoStay GC precedent).
      await prisma.changeRequest.deleteMany({
        where: { itineraryItemId: request.itineraryItem.id },
      });
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

/* ── Itinerary CRUD ──────────────────────────────────────────────────────
   Times are entered as wall-clock in the PROPERTY's timezone and converted
   via zonedDateTime — never the server's tz (Vercel runs UTC). */

const ITINERARY_CATEGORIES = Object.values(ItineraryCategory);

type ItineraryFields = {
  title: string;
  category: ItineraryCategory;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  sortOrder: number;
};

/**
 * Shared field parsing for create/update. Returns a named error instead of
 * silently no-oping — the forms surface it via useActionState (review
 * finding: an Add that silently does nothing reads as "it saved").
 */
function parseItineraryFields(
  formData: FormData,
  timezone: string,
): { ok: true; fields: ItineraryFields } | { ok: false; error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "") as ItineraryCategory;
  const category = ITINERARY_CATEGORIES.includes(categoryRaw) ? categoryRaw : "NOTE";
  const dateStr = String(formData.get("date") ?? "").trim();
  const timeStr = String(formData.get("time") ?? "").trim();
  const endTimeStr = String(formData.get("endsAtTime") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const sortRaw = Number.parseInt(String(formData.get("sortOrder") ?? ""), 10);
  const sortOrder = Number.isFinite(sortRaw) ? sortRaw : 0;

  if (!title) return { ok: false, error: "Title is required." };
  if (!dateStr) return { ok: false, error: "Date is required." };

  // No time → all-day, anchored at noon property-local (existing pattern).
  const allDay = !timeStr;
  const startsAt = zonedDateTime(dateStr, timeStr || "12:00", timezone);
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: "Couldn't read that date/time — use the date and time pickers." };
  }

  let endsAt: Date | null = null;
  if (!allDay && endTimeStr) {
    const e = zonedDateTime(dateStr, endTimeStr, timezone);
    if (Number.isNaN(e.getTime())) {
      return { ok: false, error: "Couldn't read the end time." };
    }
    endsAt = e;
  }

  return {
    ok: true,
    fields: { title, category, startsAt, endsAt, allDay, location, description, sortOrder },
  };
}

export async function createItineraryItem(
  _prev: OpsResult | null,
  formData: FormData,
): Promise<OpsResult> {
  await requireOperator();

  const stayId = String(formData.get("stayId") ?? "");
  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: { property: true },
  });
  if (!stay) return { ok: false, error: "Stay not found." };

  const parsed = parseItineraryFields(formData, stay.property.timezone);
  if (!parsed.ok) return parsed;

  await prisma.itineraryItem.create({ data: { stayId: stay.id, ...parsed.fields } });

  revalidateSurfaces(stay.id);
  return { ok: true };
}

export async function updateItineraryItem(
  _prev: OpsResult | null,
  formData: FormData,
): Promise<OpsResult> {
  await requireOperator();

  const itemId = String(formData.get("itemId") ?? "");
  const item = await prisma.itineraryItem.findUnique({
    where: { id: itemId },
    include: { stay: { include: { property: true } } },
  });
  if (!item) return { ok: false, error: "Item not found." };

  const parsed = parseItineraryFields(formData, item.stay.property.timezone);
  if (!parsed.ok) return parsed;

  // Checkbox semantics: absent = false, so unticking clears the guest chip.
  const changePending = formData.get("changePending") === "on";

  await prisma.itineraryItem.update({
    where: { id: item.id },
    data: { ...parsed.fields, changePending },
  });

  revalidateSurfaces(item.stayId);
  return { ok: true };
}

/**
 * Flip ONLY changePending. A dedicated narrow action so the one-click toggle
 * can't clobber a concurrent edit with stale mirrored state (review finding —
 * the toggle previously re-posted the whole item from page-load values).
 */
export async function setItineraryChangePending(formData: FormData): Promise<void> {
  await requireOperator();

  const itemId = String(formData.get("itemId") ?? "");
  const changePending = formData.get("changePending") === "on";

  const item = await prisma.itineraryItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  await prisma.itineraryItem.update({ where: { id: item.id }, data: { changePending } });

  revalidateSurfaces(item.stayId);
}

/**
 * Delete an itinerary item. Deleting one linked to a serviceRequest is
 * allowed and leaves the request untouched — request lifecycle stays
 * setRequestStatus's job (the UI shows a "linked" hint beforehand).
 */
export async function deleteItineraryItem(formData: FormData): Promise<void> {
  await requireOperator();

  const itemId = String(formData.get("itemId") ?? "");
  const item = await prisma.itineraryItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  // Change rows hold a required FK on the item — clear them first.
  await prisma.changeRequest.deleteMany({ where: { itineraryItemId: item.id } });
  await prisma.itineraryItem.delete({ where: { id: item.id } });

  revalidateSurfaces(item.stayId);
}

/* ── Change-request resolution (the ops Changes queue) ───────────────────
   A change resolves exactly two ways — APPLIED or DECLINED — and both clear
   the guest's "Being rearranged" chip. MOVE/MODIFY rows are kept (stamped
   resolvedAt); a CANCEL deletes the item, and the rows go with it (required
   FK) — the cancelled REQUEST stays the demand record. When change history
   matters enough, make ChangeRequest.itineraryItemId nullable and keep all
   rows; flagged, not built. */

/**
 * Apply a MOVE/MODIFY by editing the item (the ItineraryItemForm reuse —
 * the operator can honor the ask exactly or land somewhere agreed). One
 * submission updates the item, clears the chip, and resolves the change.
 */
export async function applyChangeEdit(
  _prev: OpsResult | null,
  formData: FormData,
): Promise<OpsResult> {
  await requireOperator();

  const changeId = String(formData.get("changeId") ?? "");
  const change = await prisma.changeRequest.findUnique({
    where: { id: changeId },
    include: {
      itineraryItem: { include: { stay: { include: { property: true } } } },
    },
  });
  if (!change) return { ok: false, error: "Change request not found." };
  if (change.status !== "OPEN") return { ok: false, error: "Already resolved." };

  const item = change.itineraryItem;
  const parsed = parseItineraryFields(formData, item.stay.property.timezone);
  if (!parsed.ok) return parsed;

  // Claim the row first (guarded on OPEN) so the resolution label can never
  // disagree with what happened to the item: if another tap already resolved
  // this change, we touch nothing. The item edit rides the same transaction.
  let applied = false;
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.changeRequest.updateMany({
      where: { id: change.id, status: "OPEN" },
      data: { status: "APPLIED", resolvedAt: new Date() },
    });
    if (claimed.count === 0) return;
    applied = true;
    await tx.itineraryItem.update({
      where: { id: item.id },
      data: { ...parsed.fields, changePending: false },
    });
  });
  if (!applied) return { ok: false, error: "Already resolved." };

  revalidateSurfaces(change.stayId);
  return { ok: true };
}

/**
 * Apply a CANCEL: the standing cancel semantics (setRequestStatus) — linked
 * request → CANCELLED (when its status allows) with PENDING lines voided,
 * and the item leaves the itinerary. The item's change rows go with it
 * (required FK, no cascade); the CANCELLED request + VOID lines remain the
 * record. This change row itself is deleted with the item — kind=CANCEL
 * history lives on the request's operatorNote.
 */
export async function applyChangeCancel(formData: FormData): Promise<void> {
  await requireOperator();

  const changeId = String(formData.get("changeId") ?? "");
  const change = await prisma.changeRequest.findUnique({
    where: { id: changeId },
    include: { serviceRequest: true },
  });
  if (!change || change.status !== "OPEN" || change.kind !== "CANCEL") return;

  // A delivered/terminal service is never cancellable in-app (the guest UI
  // gates Cancel out pre-delivery, and the queue hides the button). If a stale
  // cancel was completed out from under us, REFUSE the destructive path — don't
  // void an owed bill or delete a delivered item. The operator declines it
  // instead; the item + bill stand. Internal must match external.
  const cancellable = change.serviceRequest
    ? (TRANSITIONS[change.serviceRequest.status] ?? []).includes("CANCELLED")
    : true;
  if (!cancellable) return;

  await prisma.$transaction(async (tx) => {
    // Claim the row (guarded on OPEN) so exactly one resolver acts.
    const claimed = await tx.changeRequest.updateMany({
      where: { id: change.id, status: "OPEN" },
      data: { status: "APPLIED", resolvedAt: new Date() },
    });
    if (claimed.count === 0) return;

    if (change.serviceRequest) {
      await tx.serviceRequest.update({
        where: { id: change.serviceRequest.id },
        data: {
          status: "CANCELLED",
          operatorNote: [
            change.serviceRequest.operatorNote,
            `Cancelled at the guest's request (in-app change)${change.note ? ` — "${change.note}"` : ""}.`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });
      await tx.tabLineItem.updateMany({
        where: { serviceRequestId: change.serviceRequest.id, status: "PENDING" },
        data: { status: "VOID" },
      });
    }

    // The item leaves the itinerary; its change rows go with it (required FK,
    // no cascade). The CANCELLED request + VOID lines remain the record.
    await tx.changeRequest.deleteMany({
      where: { itineraryItemId: change.itineraryItemId },
    });
    await tx.itineraryItem.delete({ where: { id: change.itineraryItemId } });
  });

  revalidateSurfaces(change.stayId);
}

/** Decline a change: the item stands as planned; the chip clears. */
export async function declineChangeRequest(formData: FormData): Promise<void> {
  await requireOperator();

  const changeId = String(formData.get("changeId") ?? "");
  const change = await prisma.changeRequest.findUnique({ where: { id: changeId } });
  if (!change || change.status !== "OPEN") return;

  // Claim-first (guarded on OPEN): exactly one resolver wins, so an APPLIED
  // edit and a DECLINE can't both land and leave the label disagreeing with
  // the item.
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.changeRequest.updateMany({
      where: { id: change.id, status: "OPEN" },
      data: { status: "DECLINED", resolvedAt: new Date() },
    });
    if (claimed.count === 0) return;
    await tx.itineraryItem.update({
      where: { id: change.itineraryItemId },
      data: { changePending: false },
    });
  });

  revalidateSurfaces(change.stayId);
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
