import "server-only";
import type { GuestTouch, TouchKind } from "@prisma/client";
import { prisma } from "./db";
import { getStayPhase } from "./stayPhase";

/**
 * The pre-arrival cadence, derived (Ops Decisions: at booking · ~2wk
 * post-booking · ~2wk pre-arrival). The system computes what's DUE; a human
 * decides and sends — operator-triggered by doctrine, never automated.
 * Post-departure touches (sentiment-first, restay-second) are deliberately
 * ABSENT: parked on the roadmap until the guest is home, per doctrine.
 *
 * ⚠ FIRING LOGIC IS v1 — PLACEHOLDER, NOT THE DECIDED CADENCE (Parker,
 * 2026-06-13). Due times below are naive calendar math off booking +
 * arrival dates; they are SIGNAL-BLIND. The decided design — what fires
 * when, as a function of stay dates AND what the guest has already
 * signaled/completed — is roadmapped, not built. Nothing here auto-fires,
 * so this scaffold locks in no behavior: it surfaces "due" for the
 * operator's glance and waits for a tap. See docs/roadmap when it lands.
 */

const DAY = 24 * 60 * 60 * 1000;

export type TouchStatus =
  | "sent"
  | "due" // window open, not sent — the operator's move
  | "upcoming" // not yet due
  | "lapsed"; // stay started/ended without it — record, not a task

export type TouchRow = {
  kind: TouchKind;
  label: string;
  detail: string;
  dueAt: Date;
  status: TouchStatus;
  sentAt: Date | null;
  channel: string | null;
  sentTo: string | null;
};

const LABELS: Record<TouchKind, { label: string; detail: string }> = {
  WELCOME: {
    label: "Welcome — the link",
    detail: "At booking: their trip, one tap away.",
  },
  PLAN_AHEAD: {
    label: "Plan-ahead",
    detail: "~2 wks after booking: a few one-tap questions (/plan).",
  },
  PRE_ARRIVAL: {
    label: "Pre-arrival",
    detail: "~2 wks out: nearly here — anything still open, one tap closes it.",
  },
};

/**
 * Due times from the stay's own dates. Short-lead bookings compress: every
 * touch stays inside [booking, arrival) and keeps its order.
 */
function dueTimes(stay: { createdAt: Date; arrivalDate: Date }): Record<TouchKind, Date> {
  const booked = stay.createdAt.getTime();
  const arrival = stay.arrivalDate.getTime();
  const clamp = (t: number, floor: number) =>
    new Date(Math.max(floor, Math.min(t, arrival - DAY)));
  return {
    WELCOME: new Date(booked),
    PLAN_AHEAD: clamp(booked + 14 * DAY, booked + 1 * DAY),
    PRE_ARRIVAL: clamp(arrival - 14 * DAY, booked + 2 * DAY),
  };
}

export function buildTouchPlan(
  stay: { createdAt: Date; arrivalDate: Date; departureDate: Date },
  timezone: string,
  touches: Pick<GuestTouch, "kind" | "createdAt" | "channel" | "sentTo">[],
  now = new Date(),
): TouchRow[] {
  const due = dueTimes(stay);
  const phase = getStayPhase(stay, timezone, now);
  const sent = new Map(touches.map((t) => [t.kind, t]));

  return (Object.keys(LABELS) as TouchKind[]).map((kind) => {
    const record = sent.get(kind) ?? null;
    const status: TouchStatus = record
      ? "sent"
      : phase !== "PRE_ARRIVAL"
        ? "lapsed"
        : now.getTime() >= due[kind].getTime()
          ? "due"
          : "upcoming";
    return {
      kind,
      label: LABELS[kind].label,
      detail: LABELS[kind].detail,
      dueAt: due[kind],
      status,
      sentAt: record?.createdAt ?? null,
      channel: record?.channel ?? null,
      sentTo: record?.sentTo ?? null,
    };
  });
}

/** Sent touches for a stay — fetched separately so this build never has to
 *  touch opsQueries.ts (concurrent-build discipline). */
export async function getStayTouches(stayId: string) {
  return prisma.guestTouch.findMany({
    where: { stayId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Record a sent touch, idempotently — a double-click can't double-record
 * (and callers treat "already recorded" as success; the email seam itself
 * already refused to double-send by the time this is called).
 */
export async function recordTouch(input: {
  stayId: string;
  kind: TouchKind;
  channel: string;
  sentTo: string | null;
}): Promise<void> {
  await prisma.guestTouch.upsert({
    where: { stayId_kind: { stayId: input.stayId, kind: input.kind } },
    create: input,
    update: {}, // first record wins — the panel renders the original send
  });
}

/** First access token that still resolves — what cadence links ride on. */
export function liveTokenId(
  tokens: { id: string; revokedAt: Date | null; expiresAt: Date | null }[],
  now = Date.now(),
): string | null {
  return (
    tokens.find((t) => !t.revokedAt && (!t.expiresAt || t.expiresAt.getTime() > now))
      ?.id ?? null
  );
}
