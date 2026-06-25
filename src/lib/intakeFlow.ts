/**
 * The guided trip-intake flow (/plan) — question config + answer parsing.
 *
 * Register rule (decided): PRESUPPOSE THE STANDARD, let them opt out. Each
 * question frames the service as the normal thing guests do — concrete,
 * sensory, already-happening. Never "would you like us to arrange…".
 * Every screen exits gracefully; the pass label is the one-tap, zero-guilt
 * opt-out. NO PRICES in the flow — interest capture, not checkout.
 *
 * DEMO-LEVEL CONFIG (the serviceForm.ts pattern): definitions live in code,
 * answers land in `TripIntake.answersJson` as a plain array. No `server-only`
 * — the client flow renders these directly.
 */

export type IntakeQuestion = {
  key: string;
  /** Quiet uppercase eyebrow above the serif question. */
  eyebrow: string;
  /** The serif headline — an elegant host asking, not a form labeling. */
  question: string;
  /** One quiet supporting line under the question. */
  detail: string;
  /** The presupposed-standard accept. */
  yesLabel: string;
  /** The guilt-free pass. */
  passLabel: string;
  /** L1 catalog mapping — future linking; an interest is a flag, not a booking. */
  serviceSlug: string;
  /** Short label for ops chips + operator notifications. */
  interestLabel: string;
  /** Conditional: show ONLY if the named question was DECLINED (evaluated
   *  client-side against live answers). Used to surface the bar when grocery
   *  is passed, so alcohol demand isn't lost. Undefined = always shown. */
  showWhenDeclined?: string;
};

/**
 * A stay PARAMETER, not a service interest — a neutral fact about the trip
 * (not an offer to presuppose). It writes to a Stay column, never enrolls as
 * a SIGNALED request, and is deliberately kept OUT of INTAKE_QUESTIONS /
 * answersJson. Two plain options, no "accept vs. pass" framing.
 */
export type ParameterQuestion = {
  key: "hasRentalCar";
  eyebrow: string;
  question: string;
  detail: string;
  /** Maps to the boolean — left answer = true, right answer = false. */
  trueLabel: string;
  falseLabel: string;
};

/**
 * Will the guest have their own car? Captured to re-price the distance-activity
 * menu later (v2 shuttle nudge). Neutral register — there's no standard to
 * presuppose, so it's a calm either/or, not a guilt-free opt-out.
 */
export const RENTAL_CAR_QUESTION: ParameterQuestion = {
  key: "hasRentalCar",
  eyebrow: "Getting around",
  question: "Will you have a car while you're here?",
  detail: "If not, we'll make sure you can get wherever you're headed.",
  trueLabel: "We'll have a car",
  falseLabel: "No car, get us around",
};

/* Season-agnostic anchors — the demand-router L1s every trip starts with. */

const Q_AIRPORT: IntakeQuestion = {
  key: "airport-car",
  eyebrow: "Getting there",
  question: "Should we have a car waiting when you land at SLC?",
  detail: "A private car, your driver tracking the flight — no curb to fight.",
  yesLabel: "Yes, have a car waiting",
  passLabel: "I'm set",
  serviceSlug: "airport-transfer-slc",
  interestLabel: "Airport car",
};

const Q_KITCHEN: IntakeQuestion = {
  key: "kitchen",
  eyebrow: "The kitchen",
  question: "Arriving to a stocked kitchen, or planning to shop?",
  detail: "Send a list whenever. It'll be put away before you walk in.",
  yesLabel: "Stock it",
  passLabel: "I'll shop",
  serviceSlug: "grocery-pre-stock",
  interestLabel: "Kitchen stocking",
};

// Conditional — only when the kitchen question is DECLINED. If they're stocking
// groceries, the grocery flow's bar cross-attach captures the bar; if they
// pass, this catches the alcohol demand that would otherwise be lost.
const Q_BAR: IntakeQuestion = {
  key: "bar",
  eyebrow: "The bar",
  question: "Should the bar be stocked when you arrive?",
  detail: "Wine and spirits, chosen to your taste and waiting when you arrive.",
  yesLabel: "Stock the bar",
  passLabel: "We're set",
  serviceSlug: "bar-stocking",
  interestLabel: "Bar stocking",
  showWhenDeclined: "kitchen",
};

const Q_CHEF: IntakeQuestion = {
  key: "chef",
  eyebrow: "A night in",
  question: "Most guests do at least one dinner in-residence. Want us to hold a chef for a night?",
  detail: "A menu built around your table. Just tell us the night.",
  yesLabel: "Tell me more",
  passLabel: "We're set",
  serviceSlug: "private-chef-dinner",
  interestLabel: "Chef night",
};

/* Winter dishes (the original set). */

const WINTER_ONLY: IntakeQuestion[] = [
  {
    key: "gear",
    eyebrow: "On the snow",
    question: "Skis and boots fitted and waiting in the mudroom, or bringing your own?",
    detail: "Fitted at the residence and swapped anytime. No shop lines.",
    yesLabel: "Fit us",
    passLabel: "Bringing ours",
    serviceSlug: "ski-rental",
    interestLabel: "Ski & gear fitting",
  },
  {
    key: "guide",
    eyebrow: "The mountain",
    question: "One day with a private guide, first tracks and no lift lines. Interested?",
    detail: "Your pace and your terrain, the mountain before anyone else gets to it.",
    yesLabel: "Interested",
    passLabel: "Not this trip",
    serviceSlug: "private-ski-guide",
    interestLabel: "Private guide",
  },
];

/* Summer dishes — PLACEHOLDER COPY pending Parker's copy pass (flagged in
   the PR); the presupposing register holds, the words may not. */

const SUMMER_ONLY: IntakeQuestion[] = [
  {
    key: "bike-gear",
    eyebrow: "On the trails",
    question: "Bikes fitted and waiting at the residence, or bringing your own?",
    detail: "Sized to each rider and delivered before you arrive. No shop stop.",
    yesLabel: "Fit us",
    passLabel: "Bringing ours",
    serviceSlug: "bike-rental",
    interestLabel: "Bike fitting",
  },
  {
    key: "fly-fishing",
    eyebrow: "The water",
    question: "A guided morning on the river, with rod, waders, and someone who knows every bend?",
    detail: "Everything provided. First cast by nine.",
    yesLabel: "Interested",
    passLabel: "Not this trip",
    serviceSlug: "guided-fly-fishing",
    interestLabel: "Fly fishing",
  },
  {
    key: "ebike",
    eyebrow: "The valley",
    question: "A sunset e-bike loop through the aspens. Should we hold a night?",
    detail: "Guided, at golden hour. The easy kind of unforgettable.",
    yesLabel: "Hold it",
    passLabel: "Not this trip",
    serviceSlug: "sunset-ebike-tour",
    interestLabel: "Sunset e-bike",
  },
];

/**
 * The question set for a season — stay dates pick it for World A
 * (staySeason), today's date for World B (seasonForDate). The anchors
 * (car, kitchen) open both; chef closes both.
 */
export function intakeQuestionsFor(season: "WINTER" | "SUMMER"): IntakeQuestion[] {
  return season === "WINTER"
    ? [Q_AIRPORT, Q_KITCHEN, Q_BAR, ...WINTER_ONLY, Q_CHEF]
    : [Q_AIRPORT, Q_KITCHEN, Q_BAR, ...SUMMER_ONLY, Q_CHEF];
}

/**
 * Every question across both seasons — the lookup table for stored answers
 * (ops chips, notifications, answer parsing). Keys are unique across
 * seasons; a stored answer resolves regardless of which season asked it.
 */
export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  Q_AIRPORT,
  Q_KITCHEN,
  Q_BAR,
  ...WINTER_ONLY,
  ...SUMMER_ONLY,
  Q_CHEF,
];

export type IntakeAnswerValue = "interested" | "declined";

export type IntakeAnswer = {
  key: string;
  question: string;
  answer: IntakeAnswerValue;
  serviceSlug: string;
};

/** Parse `TripIntake.answersJson` defensively (loose JSON column). */
export function parseIntakeAnswers(json: unknown): IntakeAnswer[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (a): a is IntakeAnswer =>
      typeof a === "object" &&
      a !== null &&
      typeof (a as IntakeAnswer).key === "string" &&
      ((a as IntakeAnswer).answer === "interested" ||
        (a as IntakeAnswer).answer === "declined"),
  );
}

/** Short labels for the questions answered "interested" — ops chips, emails. */
export function interestedLabels(answers: IntakeAnswer[]): string[] {
  return answers
    .filter((a) => a.answer === "interested")
    .map(
      (a) => INTAKE_QUESTIONS.find((q) => q.key === a.key)?.interestLabel ?? a.key,
    );
}

/** Catalog slugs for the questions answered "interested" — service matching. */
export function interestedSlugs(answers: IntakeAnswer[]): string[] {
  return answers
    .filter((a) => a.answer === "interested" && typeof a.serviceSlug === "string")
    .map((a) => a.serviceSlug);
}

/** Interest labels for a set of catalog slugs (trip-home "Before you arrive"). */
export function labelsForSlugs(slugs: string[]): string[] {
  return INTAKE_QUESTIONS.filter((q) => slugs.includes(q.serviceSlug)).map(
    (q) => q.interestLabel,
  );
}
