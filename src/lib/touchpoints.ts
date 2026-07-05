import "server-only";
import type { GuestTouch, TouchKind } from "@prisma/client";
import { prisma } from "./db";
import { getStayPhase } from "./stayPhase";
import type { RenderedEmail } from "./guestEmail";

/**
 * The pre-arrival cadence engine — SIGNAL-AWARE (Track A of the nudge-cadence
 * plan, docs/plans/2026-06-22-nudge-cadence.md; replaces the signal-blind v1
 * placeholder). The system computes what's DUE and what's SUPPRESSED; a human
 * decides and sends — operator-triggered by doctrine, never automated. No
 * scheduler. Post-departure touches stay deliberately ABSENT (nothing pushed
 * until the guest is home).
 *
 * The crook test (Ethical Charter) is the law here: a touch corrects toward
 * the GUEST's own intent — invite planning they haven't done, surface what
 * waits on them, finish what they started. A touch whose job is already done
 * is SUPPRESSED, with the reason shown to the operator. Never prod someone
 * who's already served; never prod toward our gain against their interest.
 *
 * The cadence (Ops Decisions, vault): WELCOME at booking · PLAN_AHEAD ~2wk
 * post-booking · PRE_ARRIVAL ~2wk out — plus RESUME, the behavior-gated
 * abandonment nudge (opened the link, went quiet, nothing planned).
 */

const DAY = 24 * 60 * 60 * 1000;

/** Quiet days after the guest's last visit before RESUME becomes due. */
const RESUME_QUIET_DAYS = 4;
/** Inside this many days to arrival, RESUME stands down (PRE_ARRIVAL's job). */
const RESUME_MIN_LEAD_DAYS = 3;

export type TouchStatus =
  | "sent"
  | "due" // window open, not sent — the operator's move
  | "upcoming" // not yet due
  | "suppressed" // its job is already done — sending would be noise
  | "lapsed"; // stay started/ended without it — record, not a task

/** What the guest has already done — read-only, loaded in one pass. */
export type TouchSignals = {
  /** Latest link open across the stay's tokens (null = never opened). */
  linkOpenedAt: Date | null;
  welcomeSeenAt: Date | null;
  /** A completed /plan intake exists for this stay. */
  intakeDone: boolean;
  /** SIGNALED / READY request titles — started, not finished. */
  openRequests: string[];
  /** CONFIRMED / SCHEDULED request titles — locked in. */
  confirmedRequests: string[];
  /** QUOTED count — priced, waiting on the guest's yes. */
  awaitingApproval: number;
};

export type TouchRow = {
  kind: TouchKind;
  label: string;
  detail: string;
  /** null = not applicable yet (RESUME before any visit). */
  dueAt: Date | null;
  status: TouchStatus;
  suppressReason: string | null;
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
    detail: "~2 wks out: names what's set and what's still open.",
  },
  RESUME: {
    label: "Resume",
    detail: `Stepped inside, went quiet ${RESUME_QUIET_DAYS}+ days with nothing planned.`,
  },
};

export async function loadTouchSignals(stay: {
  id: string;
  welcomeSeenAt: Date | null;
}): Promise<TouchSignals> {
  const [intakeCount, requests, tokenAgg] = await Promise.all([
    prisma.tripIntake.count({ where: { stayId: stay.id } }),
    prisma.serviceRequest.findMany({
      where: {
        stayId: stay.id,
        status: { in: ["SIGNALED", "READY", "QUOTED", "CONFIRMED", "SCHEDULED"] },
      },
      select: {
        status: true,
        customTitle: true,
        service: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.accessToken.aggregate({
      where: { stayId: stay.id },
      _max: { lastAccessedAt: true },
    }),
  ]);

  const title = (r: (typeof requests)[number]) =>
    r.service?.name ?? r.customTitle ?? "a request";

  return {
    linkOpenedAt: tokenAgg._max.lastAccessedAt,
    welcomeSeenAt: stay.welcomeSeenAt,
    intakeDone: intakeCount > 0,
    openRequests: requests
      .filter((r) => r.status === "SIGNALED" || r.status === "READY")
      .map(title),
    confirmedRequests: requests
      .filter((r) => r.status === "CONFIRMED" || r.status === "SCHEDULED")
      .map(title),
    awaitingApproval: requests.filter((r) => r.status === "QUOTED").length,
  };
}

/** Anything at all in motion (started, priced, or locked in)? */
function inMotionCount(s: TouchSignals): number {
  return s.openRequests.length + s.confirmedRequests.length + s.awaitingApproval;
}

/**
 * RESUME's clock runs on welcomeSeenAt ONLY — the "Step inside" tap is a
 * human act no email scanner performs, while linkOpenedAt stamps on every
 * GET of /t/ (corporate link scanners included). Trading a little recall
 * for zero false "you had a look" emails: a guest who only ever followed a
 * deep link (?next= skips the welcome) never gets a RESUME, and that's
 * fine — deep links are sent to guests with requests already in motion,
 * which suppresses RESUME anyway.
 */
function lastVisit(s: TouchSignals): Date | null {
  return s.welcomeSeenAt;
}

/**
 * Calendar due times from the stay's own dates. Short-lead bookings
 * compress: every touch stays inside [booking, arrival) and keeps its order.
 */
function dueTimes(stay: {
  createdAt: Date;
  arrivalDate: Date;
}): Record<Exclude<TouchKind, "RESUME">, Date> {
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

/**
 * Suppression — the crook test in code. Returns the operator-facing reason,
 * or null when the touch still has a job to do. WELCOME never suppresses
 * (the written document has value even after a first visit); PRE_ARRIVAL
 * never suppresses (its content degrades to "you're all set" instead).
 */
function suppressReason(kind: TouchKind, s: TouchSignals): string | null {
  if (kind === "PLAN_AHEAD") {
    if (s.intakeDone) return "Already planned — /plan is done.";
    if (inMotionCount(s) >= 2)
      return "Already planning — services are in motion.";
    return null;
  }
  if (kind === "RESUME") {
    if (lastVisit(s) == null)
      return "Hasn't stepped inside yet — welcome/plan-ahead do this job. (Link opens alone don't count; scanners open links.)";
    if (s.intakeDone || inMotionCount(s) > 0) return "They picked it back up on their own.";
    return null;
  }
  return null;
}

export function buildTouchPlan(
  stay: {
    createdAt: Date;
    arrivalDate: Date;
    departureDate: Date;
  },
  timezone: string,
  touches: Pick<GuestTouch, "kind" | "createdAt" | "channel" | "sentTo">[],
  signals: TouchSignals,
  now = new Date(),
): TouchRow[] {
  const due = dueTimes(stay);
  const phase = getStayPhase(stay, timezone, now);
  const sent = new Map(touches.map((t) => [t.kind, t]));

  return (Object.keys(LABELS) as TouchKind[]).map((kind) => {
    const record = sent.get(kind) ?? null;

    // RESUME is behavior-clocked, not calendar-clocked: quiet-period after
    // the last visit, standing down close to arrival.
    const visit = lastVisit(signals);
    const dueAt =
      kind === "RESUME"
        ? visit
          ? new Date(visit.getTime() + RESUME_QUIET_DAYS * DAY)
          : null
        : due[kind];

    const reason = record ? null : suppressReason(kind, signals);
    const tooCloseForResume =
      kind === "RESUME" &&
      stay.arrivalDate.getTime() - now.getTime() < RESUME_MIN_LEAD_DAYS * DAY;

    const status: TouchStatus = record
      ? "sent"
      : phase !== "PRE_ARRIVAL"
        ? "lapsed"
        : reason
          ? "suppressed"
          : tooCloseForResume
            ? "suppressed"
            : dueAt == null
              ? "upcoming"
              : now.getTime() >= dueAt.getTime()
                ? "due"
                : "upcoming";

    return {
      kind,
      label: LABELS[kind].label,
      detail: LABELS[kind].detail,
      dueAt,
      status,
      suppressReason:
        status === "suppressed"
          ? (reason ?? "Arrival is close — pre-arrival covers it.")
          : null,
      sentAt: record?.createdAt ?? null,
      channel: record?.channel ?? null,
      sentTo: record?.sentTo ?? null,
    };
  });
}

/* ── Content — what each touch SAYS, as a function of the signals. The
      subject/body name what's set and what's still open (the guest's own
      intents, never a pitch). Consumed by actions/touchpoints.ts via
      guestEmail.sendCadenceEmail. WELCOME keeps its bespoke template. ── */

/** Human list: "A", "A and B", "A, B, and 2 more" — capped so emails stay calm. */
function joinList(items: string[], cap = 2): string {
  if (items.length <= cap) {
    return items.length === 2 ? `${items[0]} and ${items[1]}` : items.join("");
  }
  const rest = items.length - cap;
  return `${items.slice(0, cap).join(", ")}, and ${rest} more`;
}

export type TouchContent = RenderedEmail & {
  /** Relative in-app destination the tokened link should land on. */
  nextPath: string | null;
};

export function touchEmailContent(
  kind: Exclude<TouchKind, "WELCOME">,
  ctx: {
    guestFirstName: string;
    propertyName: string;
    dateRange: string;
    signals: TouchSignals;
  },
): TouchContent {
  const { guestFirstName: name, propertyName, dateRange, signals: s } = ctx;

  if (kind === "PLAN_AHEAD") {
    return {
      subject: `Shall we get your stay arranged?`,
      headline: `${name}, let's get ahead of it.`,
      paragraphs: [
        `Your stay at ${propertyName} is on our books, and the best trips are arranged before the bags are packed.`,
        `A few quick questions about the car, the kitchen, the gear, and your concierge takes it from there.`,
      ],
      ctaLabel: "Plan your stay",
      closing: "A couple of minutes now, and arrival looks after itself.",
      nextPath: "/plan",
    };
  }

  if (kind === "RESUME") {
    return {
      subject: `Shall we pick up where you left off?`,
      headline: `${name}, we kept your place.`,
      paragraphs: [
        `You had a look at your ${propertyName} trip page. Nothing's arranged yet, and that's easy to fix.`,
        `A few one-tap questions and your concierge handles the rest. The car, the kitchen, the gear.`,
      ],
      ctaLabel: "Pick it back up",
      closing: "Whenever you're ready. No rush.",
      nextPath: "/plan",
    };
  }

  // PRE_ARRIVAL — signal-aware: name what's set, what waits on them, what's
  // open; degrade to a warm "you're all set" when everything's handled.
  const paragraphs: string[] = [];
  const confirmed = s.confirmedRequests;
  const open = s.openRequests;

  paragraphs.push(
    confirmed.length > 0
      ? `${propertyName}, ${dateRange}. ${joinList(confirmed)} ${confirmed.length === 1 ? "is" : "are"} set.`
      : `${propertyName}, ${dateRange}. Your trip page has the latest.`,
  );

  const second: string[] = [];
  if (s.awaitingApproval > 0) {
    second.push(
      s.awaitingApproval === 1
        ? `One thing waits on your yes: a priced request is ready to approve.`
        : `${s.awaitingApproval} priced requests are ready for your yes.`,
    );
  }
  if (open.length > 0) {
    second.push(
      `Still open: ${joinList(open)}. A tap or two finishes ${open.length === 1 ? "it" : "them"}.`,
    );
  }
  if (second.length === 0 && confirmed.length === 0) {
    second.push(`If something should be waiting when you arrive, it's one tap away.`);
  }
  if (second.length > 0) paragraphs.push(second.join(" "));

  const allHandled =
    confirmed.length > 0 && open.length === 0 && s.awaitingApproval === 0;

  return {
    subject: `${propertyName} is nearly ready for you`,
    headline: `${name}, it's nearly time.`,
    paragraphs,
    ctaLabel: "Open your trip",
    closing: allHandled
      ? "You're all set. We'll have it all waiting."
      : "We'll have it all waiting.",
    nextPath: null,
  };
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
