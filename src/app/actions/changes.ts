"use server";

import type { ChangeKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActiveStay } from "@/lib/session";
import { notifyOperator } from "@/lib/notify";
import { changeWindows } from "@/lib/changePolicy";
import { formatDayLabel, formatTime } from "@/lib/dates";
import { getStayPhase } from "@/lib/stayPhase";

/**
 * Structured change requests, guest side (Channel Doctrine 2026-06-12): a
 * change is a structured tap, never a composed message. The guest asks; the
 * row lands in the ops Changes queue; the operator applies or declines; the
 * itinerary's "Being rearranged" chip covers the in-between. The cutoff gate
 * is enforced HERE as well as on the page — a stale tab can't slip a
 * same-day move past the doctrine.
 */

export type ChangeResult = { ok: true; kind: ChangeKind } | { ok: false; error: string };

const KINDS: ChangeKind[] = ["MOVE", "CANCEL", "MODIFY"];

export async function createChangeRequest(
  _prev: ChangeResult | null,
  formData: FormData,
): Promise<ChangeResult> {
  const active = await getActiveStay();
  if (!active) {
    return { ok: false, error: "Your session has expired — please reopen your link." };
  }
  const { stay } = active;

  if (getStayPhase(stay, stay.property.timezone) === "POST_STAY") {
    return {
      ok: false,
      error: "Your stay has wrapped — text your concierge and we'll take care of next time.",
    };
  }

  const itemId = String(formData.get("itemId") ?? "");
  const kind = String(formData.get("kind") ?? "") as ChangeKind;
  if (!KINDS.includes(kind)) {
    return { ok: false, error: "Pick what you'd like to change." };
  }

  const item = itemId
    ? await prisma.itineraryItem.findUnique({
        where: { id: itemId },
        include: {
          serviceRequest: { include: { service: true } },
          changeRequests: { where: { status: "OPEN" } },
        },
      })
    : null;
  if (!item || item.stayId !== stay.id) {
    return { ok: false, error: "We couldn’t find that — please reopen your link." };
  }
  if (item.changePending || item.changeRequests.length > 0) {
    return { ok: false, error: "Already being rearranged — your concierge has it." };
  }

  // The doctrine gate, re-checked server-side: null cutoff or past cutoff =
  // no in-app change of that shape. MODIFY rides whichever window is open.
  const windows = changeWindows(item.serviceRequest?.service, item.startsAt, {
    requestStatus: item.serviceRequest?.status,
  });
  const allowed =
    kind === "MOVE"
      ? windows.canMove
      : kind === "CANCEL"
        ? windows.canCancel
        : windows.canMove || windows.canCancel;
  if (!allowed) {
    return {
      ok: false,
      error: "This one's close-in — your concierge will handle it personally.",
    };
  }

  // MOVE carries wall-clock strings in the property tz (the ChangeRequest
  // columns are strings by design — the operator applies real instants).
  const requestedDate = String(formData.get("requestedDate") ?? "").trim() || null;
  const requestedTime = String(formData.get("requestedTime") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000) || null;

  if (kind === "MOVE") {
    if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return { ok: false, error: "Please pick a day that works better." };
    }
    if (requestedTime && !/^\d{2}:\d{2}(?::\d{2})?$/.test(requestedTime)) {
      return { ok: false, error: "Couldn’t read that time — use the time picker." };
    }
  }
  if (kind === "MODIFY" && !note) {
    return { ok: false, error: "Tell us what you need — a line is plenty." };
  }

  // Atomic claim-then-create (the guarded-updateMany money-path idiom): the
  // changePending flip is the single-winner lock — of two racing submits (two
  // tabs, a retried action on a passwordless link) only the one that flips
  // false→true creates the row; the loser gets count 0 and the same friendly
  // message as the dedup check above. Wrapped in a transaction so a failed
  // create rolls the flip back — the chip ("Being rearranged") never strands
  // without its row.
  let claimed = false;
  await prisma.$transaction(async (tx) => {
    const lock = await tx.itineraryItem.updateMany({
      where: { id: item.id, changePending: false },
      data: { changePending: true },
    });
    if (lock.count === 0) return;
    claimed = true;
    await tx.changeRequest.create({
      data: {
        stayId: stay.id,
        itineraryItemId: item.id,
        serviceRequestId: item.serviceRequestId,
        kind,
        requestedDate: kind === "MOVE" ? requestedDate : null,
        requestedTime: kind === "MOVE" ? requestedTime : null,
        note,
      },
    });
  });
  if (!claimed) {
    return { ok: false, error: "Already being rearranged — your concierge has it." };
  }

  const tz = stay.property.timezone;
  await notifyOperator({
    type: "change_requested",
    stayId: stay.id,
    guestName: `${stay.guest.firstName} ${stay.guest.lastName ?? ""}`.trim(),
    property: stay.property.name,
    itemTitle: item.title,
    kind,
    currentWhen: item.allDay
      ? formatDayLabel(item.startsAt, tz)
      : `${formatDayLabel(item.startsAt, tz)} · ${formatTime(item.startsAt, tz)}`,
    requestedWhen:
      kind === "MOVE" && requestedDate
        ? `${requestedDate}${requestedTime ? ` · ${requestedTime}` : ""} (property time)`
        : null,
    note,
    isDemo: stay.isDemo,
    partnerName: stay.property.partner?.name ?? null,
  });

  // Deliberately NO revalidatePath (the saveRequestDetails precedent): the
  // change page's render branch flips to "Being rearranged" once the row
  // exists — revalidating would unmount ChangeFlow before its close screen
  // renders. Every surface this touched is force-dynamic.

  return { ok: true, kind };
}
