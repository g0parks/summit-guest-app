"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActiveStay } from "@/lib/session";
import { notifyOperator } from "@/lib/notify";
import {
  computeChargeCents,
  confirmedRequestItineraryData,
  isFixedPrice,
} from "@/lib/catalog";
import {
  attachVisible,
  clampParty,
  flowAnswers,
  isFlowComplete,
  perPersonName,
  serviceFlow,
  showIfMatches,
  type RequestDetail,
  type ServiceFlowConfig,
} from "@/lib/serviceForm";
import { parseVendorCostNote } from "@/lib/vendorNote";
import { zonedDateTime } from "@/lib/dates";
import { getStayPhase } from "@/lib/stayPhase";
import { getBarSeeds } from "@/lib/queries";
import { barCadence, cadenceLabel, isFeeStructureService } from "@/lib/barPricing";

/**
 * The request lifecycle, guest side (Product Doctrine 2026-06-12):
 *
 *   createSignal        one tap — demand registered, nothing else asked
 *   saveRequestDetails  the guided wizard saves; completeness decides what's next
 *   approveQuote        the guest's yes on a priced QUOTED request
 *
 * Two pricing paths — NEVER conflated: fixed-price completes straight to
 * CONFIRMED (tab line + itinerary, no quote, no approval); QUOTE-priced
 * parks at READY for the operator. The operator is emailed once, at the
 * actionable transition — a tap alone is visible in /ops, not your inbox.
 */

/** Statuses where the guest can still edit details / resume the wizard. */
const OPEN_FOR_EDITS = ["SIGNALED", "READY"] as const;

function postStayError() {
  return {
    ok: false as const,
    error:
      "Your stay has wrapped — text your concierge and we'll take care of next time.",
  };
}

export type SignalResult = { ok: false; error: string };

/**
 * One tap on "Arrange this" — creates a SIGNALED request and lands the guest
 * in the guided wizard. If an open request for this service already exists,
 * resume it instead of stacking a duplicate.
 */
export async function createSignal(
  _prev: SignalResult | null,
  formData: FormData,
): Promise<SignalResult> {
  const active = await getActiveStay();
  if (!active) {
    return { ok: false, error: "Your session has expired — please reopen your link." };
  }
  const { stay } = active;

  if (getStayPhase(stay, stay.property.timezone) === "POST_STAY") {
    return postStayError();
  }

  const serviceId = String(formData.get("serviceId") ?? "");
  const service = serviceId
    ? await prisma.service.findUnique({ where: { id: serviceId } })
    : null;
  if (!service || !service.isActive) {
    return { ok: false, error: "That service isn’t available right now." };
  }

  const existing = await prisma.serviceRequest.findFirst({
    where: {
      stayId: stay.id,
      serviceId: service.id,
      status: { in: ["SIGNALED", "READY", "QUOTED"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) redirect(`/requests/${existing.id}`);

  const request = await prisma.serviceRequest.create({
    data: {
      stayId: stay.id,
      serviceId: service.id,
      status: "SIGNALED",
      // Axis A attribution: a standalone bar tap is "bar-direct"; everything
      // else off the catalog is "catalog". (Bundled bar entries arrive
      // pre-tagged "grocery-attach"/"chef-attach" via the cross-attach.)
      source: isFeeStructureService(service.slug) ? "bar-direct" : "catalog",
      partySize: stay.partySize ?? undefined,
    },
  });

  redirect(`/requests/${request.id}`);
}

export type WizardResult =
  | {
      ok: true;
      outcome: "confirmed" | "ready" | "saved";
      serviceName: string;
      chargedCents: number | null;
      /** Sibling services just spawned from a cross-attach opt-in (e.g. a chef night). */
      attached?: string[];
    }
  | { ok: false; error: string };

/**
 * Cross-attach: an opted-into offer spawns a sibling SIGNALED request for
 * another service the instant the guest ticks it — even on a "finish later"
 * exit (intent is a valuable signal; the sibling is logged, resumeable, and
 * enrolls in the ops nudge queue). Gated by the offer's showIf against the
 * answers actually given, deduped so a resume never stacks a second open
 * sibling. Returns the spawned services' display names.
 */
async function spawnAttachments(
  flow: ServiceFlowConfig,
  formData: FormData,
  details: RequestDetail[],
  stay: { id: string; partySize: number | null },
  seeds: Record<string, string> = {},
): Promise<string[]> {
  const offers = flow.attaches ?? [];
  if (offers.length === 0) return [];

  // Same seed-merge as the wizard + completeness, so a (future) seed-gated
  // attach is evaluated against exactly what the guest saw.
  const answers = { ...seeds, ...flowAnswers(details) };
  const spawned: string[] = [];
  for (const offer of offers) {
    if (!attachVisible(offer, answers)) continue;
    if (!String(formData.get(`attach_${offer.name}`) ?? "").trim()) continue;

    const target = await prisma.service.findUnique({ where: { slug: offer.targetSlug } });
    if (!target || !target.isActive) continue;

    const existing = await prisma.serviceRequest.findFirst({
      where: {
        stayId: stay.id,
        serviceId: target.id,
        status: { in: ["SIGNALED", "READY", "QUOTED"] },
      },
    });
    if (existing) continue;

    await prisma.serviceRequest.create({
      data: {
        stayId: stay.id,
        serviceId: target.id,
        status: "SIGNALED",
        source: offer.source,
        partySize: stay.partySize ?? undefined,
      },
    });
    spawned.push(target.name);
  }
  return spawned;
}

/**
 * The wizard's save. `mode=later` stores whatever's filled and keeps the
 * request SIGNALED (graceful exit — the home checklist resumes it).
 * `mode=complete` validates, stores, and advances:
 *   fixed-price → CONFIRMED + tab line (+ itinerary when dated)
 *   QUOTE       → READY (operator routes & prices)
 */
export async function saveRequestDetails(
  _prev: WizardResult | null,
  formData: FormData,
): Promise<WizardResult> {
  const active = await getActiveStay();
  if (!active) {
    return { ok: false, error: "Your session has expired — please reopen your link." };
  }
  const { stay } = active;

  if (getStayPhase(stay, stay.property.timezone) === "POST_STAY") {
    return postStayError();
  }

  const requestId = String(formData.get("requestId") ?? "");
  const request = requestId
    ? await prisma.serviceRequest.findUnique({
        where: { id: requestId },
        include: { service: true },
      })
    : null;
  if (!request || request.stayId !== stay.id || !request.service) {
    return { ok: false, error: "We couldn’t find that request — please reopen your link." };
  }
  if (!OPEN_FOR_EDITS.includes(request.status as (typeof OPEN_FOR_EDITS)[number])) {
    return { ok: false, error: "This one’s already being arranged — your concierge has it." };
  }
  const service = request.service;
  const finishLater = String(formData.get("mode") ?? "complete") === "later";

  // ── Scheduling (wall-clock in the property tz, never the server's) ──
  const dateStr = String(formData.get("date") ?? "").trim();
  const timeStr = String(formData.get("time") ?? "").trim();
  const partyRaw = String(formData.get("partySize") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!finishLater && service.requiresDate && !dateStr) {
    return { ok: false, error: "Please choose a date." };
  }

  let requestedFor: Date | null = null;
  if (dateStr) {
    const d = zonedDateTime(dateStr, timeStr || "12:00", stay.property.timezone);
    if (!Number.isNaN(d.getTime())) requestedFor = d;
  }

  const parsedParty = partyRaw ? Number.parseInt(partyRaw, 10) : NaN;
  const partySize = Number.isFinite(parsedParty)
    ? parsedParty
    : request.partySize ?? stay.partySize ?? null;

  // ── Execution details, config-driven (src/lib/serviceForm.ts) ──
  // Walk steps in order, skipping any whose showIf doesn't match the answers
  // collected so far — a hidden step (one the guest never saw) is never read
  // or required. `answers` accumulates the controlling values (mode, cookIn)
  // so chained gates resolve; it mirrors what the client renders.
  // Bar discovery seeds trip signals into the answer map (read-only, never a
  // guest input) so the seed-gated moments the client showed are the ones we
  // read here — client and server agree on what was visible.
  const isBar = isFeeStructureService(service.slug);
  const seeds = isBar ? await getBarSeeds(stay, stay.property.timezone) : {};

  const flow = serviceFlow(service.slug);
  const details: RequestDetail[] = [];
  const answers: Record<string, string> = { ...seeds };
  for (const step of flow.steps) {
    if (!showIfMatches(step.showIf, answers)) continue;
    for (const field of step.fields) {
      if (field.kind === "perPerson") {
        for (let p = 1; p <= clampParty(partySize); p++) {
          for (const sub of field.fields) {
            const name = perPersonName(field.name, p, sub.name);
            const value = String(formData.get(`detail_${name}`) ?? "").trim();
            if (!value && sub.required && !finishLater) {
              return {
                ok: false,
                error: `Please fill in “${sub.label}” for ${field.personNoun.toLowerCase()} ${p}.`,
              };
            }
            if (value) {
              details.push({
                name,
                label: `${field.personNoun} ${p} · ${sub.label}`,
                value,
              });
            }
          }
        }
      } else if (field.kind === "checkboxes") {
        const picked = formData
          .getAll(`detail_${field.name}`)
          .map((v) => String(v).trim())
          .filter(Boolean);
        if (picked.length > 0) {
          const joined = picked.join("; ");
          details.push({ name: field.name, label: field.label, value: joined });
          answers[field.name] = joined;
        }
      } else {
        const value = String(formData.get(`detail_${field.name}`) ?? "").trim();
        if (!value && field.required && !finishLater) {
          return { ok: false, error: `Please fill in “${field.label}”.` };
        }
        if (value) details.push({ name: field.name, label: field.label, value });
        // Record even empty, so a downstream showIf reads the actual answer.
        answers[field.name] = value;
      }
    }
  }

  // Fee-structure cadence is DERIVED (phase + same-day cutoff) and stored on
  // the order so ops prices against the order-time cadence — not whenever they
  // open it. Recorded as a detail (visible to ops, read by priceBarOrder).
  if (isBar) {
    const cadence = barCadence({
      phase: getStayPhase(stay, stay.property.timezone),
      now: new Date(),
      tz: stay.property.timezone,
    });
    details.push({ name: "cadence", label: "Timing", value: cadenceLabel(cadence) });
  }

  const complete =
    !finishLater &&
    isFlowComplete(flow, details, clampParty(partySize), seeds) &&
    (!service.requiresDate || requestedFor !== null);

  // ── Graceful exit: store progress, stay SIGNALED ──
  if (!complete) {
    await prisma.serviceRequest.update({
      where: { id: request.id },
      data: {
        requestedFor,
        partySize: partySize ?? undefined,
        notes,
        detailsJson: details.length > 0 ? details : undefined,
      },
    });
    // Intent captured mid-flow still spawns its sibling — a chef night ticked
    // before "finish later" is too valuable a signal to drop.
    const attached = await spawnAttachments(
      flow,
      formData,
      details,
      { id: stay.id, partySize: partySize ?? null },
      seeds,
    );
    return {
      ok: true,
      outcome: "saved",
      serviceName: service.name,
      chargedCents: null,
      attached,
    };
  }

  // ── Complete: the two pricing paths ──
  const confirmed = isFixedPrice(service.priceUnit, service.priceAmount);
  let chargedCents: number | null = null;

  // Guarded transition — a double submit can't stack tab lines: only one
  // updateMany wins the move out of the open statuses.
  const moved = await prisma.serviceRequest.updateMany({
    where: { id: request.id, status: { in: [...OPEN_FOR_EDITS] } },
    data: {
      status: confirmed ? "CONFIRMED" : "READY",
      requestedFor,
      partySize: partySize ?? undefined,
      notes,
      detailsJson: details.length > 0 ? details : undefined,
    },
  });
  if (moved.count === 0) {
    return { ok: false, error: "This one’s already being arranged — your concierge has it." };
  }

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

  // Opted-into cross-attach siblings (e.g. a chef night) spawn here too.
  const attached = await spawnAttachments(
    flow,
    formData,
    details,
    { id: stay.id, partySize: partySize ?? null },
    seeds,
  );

  // One email, at the actionable moment — not at the tap.
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

  // Deliberately NO revalidatePath (the submitStayForm precedent, PR #12):
  // revalidating re-renders the current page in the action response — the
  // request is no longer SIGNALED, so /requests/[id] would flip to its
  // status branch and unmount the wizard before its close screen renders.
  // Every surface this touched is force-dynamic; navigation renders fresh.

  return {
    ok: true,
    outcome: confirmed ? "confirmed" : "ready",
    serviceName: service.name,
    chargedCents,
    attached,
  };
}

export type ApproveResult =
  | { ok: true; serviceName: string; amountCents: number }
  | { ok: false; error: string };

/**
 * The guest's approval tap on a QUOTED request: QUOTED → CONFIRMED, and the
 * tab line + itinerary item are created HERE (moved from quoteRequest) —
 * nothing touches the tab before the guest says yes. This tap is the future
 * card-consent seam (Stripe off-session PaymentIntent drops in behind it).
 * Fixed-price services never reach QUOTED, so they never pass through here.
 */
export async function approveQuote(
  _prev: ApproveResult | null,
  formData: FormData,
): Promise<ApproveResult> {
  const active = await getActiveStay();
  if (!active) {
    return { ok: false, error: "Your session has expired — please reopen your link." };
  }
  const { stay } = active;

  if (getStayPhase(stay, stay.property.timezone) === "POST_STAY") {
    return postStayError();
  }

  const requestId = String(formData.get("requestId") ?? "");
  const request = requestId
    ? await prisma.serviceRequest.findUnique({
        where: { id: requestId },
        include: { service: true },
      })
    : null;
  if (!request || request.stayId !== stay.id) {
    return { ok: false, error: "We couldn’t find that request — please reopen your link." };
  }
  if (request.status !== "QUOTED" || request.quotedAmount == null) {
    return { ok: false, error: "This one isn’t waiting on you — your concierge has it." };
  }
  const amountCents = request.quotedAmount;
  const serviceName = request.service?.name ?? request.customTitle ?? "Concierge service";

  // Guarded transition — a double tap can't stack tab lines: only one
  // updateMany wins the move out of QUOTED.
  const moved = await prisma.serviceRequest.updateMany({
    where: { id: request.id, status: "QUOTED" },
    data: { status: "CONFIRMED" },
  });
  if (moved.count === 0) {
    return { ok: false, error: "Already confirmed — your concierge has it." };
  }

  // Vendor cost captured at quote time rides the operator note (ops-only
  // surface) until this line exists — see src/lib/vendorNote.ts.
  const vendorCostCents = parseVendorCostNote(request.operatorNote);
  await prisma.tabLineItem.create({
    data: {
      stayId: stay.id,
      serviceRequestId: request.id,
      description: serviceName,
      amount: amountCents,
      currency: stay.currency,
      status: "PENDING",
      vendorCostCents,
      pmShareCents: vendorCostCents != null ? 0 : null, // Phase-2: real PM share
      netCents: vendorCostCents != null ? amountCents - vendorCostCents : null,
    },
  });

  // Confirmed + scheduled → it belongs on the trip timeline.
  if (request.requestedFor && request.service) {
    await prisma.itineraryItem.create({
      data: confirmedRequestItineraryData({
        stayId: stay.id,
        requestId: request.id,
        service: request.service,
        notes: request.notes,
        startsAt: request.requestedFor,
      }),
    });
  }

  // The approval IS the actionable moment — the operator books the vendor now.
  await notifyOperator({
    type: "quote_approved",
    stayId: stay.id,
    guestName: `${stay.guest.firstName} ${stay.guest.lastName ?? ""}`.trim(),
    property: stay.property.name,
    serviceName,
    requestId: request.id,
    amountCents,
    isDemo: stay.isDemo,
    partnerName: stay.property.partner?.name ?? null,
  });

  // Deliberately NO revalidatePath (the saveRequestDetails precedent):
  // /requests/[id]'s render branch flips on status — revalidating would
  // unmount the approval panel before its confirmed state renders. Every
  // surface this touched is force-dynamic; navigation renders fresh.

  return { ok: true, serviceName, amountCents };
}
