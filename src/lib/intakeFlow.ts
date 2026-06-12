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
};

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    key: "airport-car",
    eyebrow: "Getting there",
    question: "Should we have a car waiting when you land at SLC?",
    detail: "A private car, driver tracking your flight — no curb chaos.",
    yesLabel: "Yes — have a car waiting",
    passLabel: "I'm set",
    serviceSlug: "airport-transfer-slc",
    interestLabel: "Airport car",
  },
  {
    key: "kitchen",
    eyebrow: "The kitchen",
    question: "Arriving to a stocked kitchen, or planning to shop?",
    detail: "Send a list later — we'll have it put away before you walk in.",
    yesLabel: "Stock it",
    passLabel: "I'll shop",
    serviceSlug: "grocery-pre-stock",
    interestLabel: "Kitchen stocking",
  },
  {
    key: "gear",
    eyebrow: "On the snow",
    question: "Skis and boots fitted and waiting in the mudroom — or bringing your own?",
    detail: "Fitted at the residence, swapped anytime — no shop lines.",
    yesLabel: "Fit us",
    passLabel: "Bringing ours",
    serviceSlug: "ski-rental",
    interestLabel: "Ski & gear fitting",
  },
  {
    key: "chef",
    eyebrow: "A night in",
    question: "Most guests do at least one dinner in-residence. Want us to hold a chef for a night?",
    detail: "A menu built around your table — we just need the night.",
    yesLabel: "Tell me more",
    passLabel: "We're set",
    serviceSlug: "private-chef-dinner",
    interestLabel: "Chef night",
  },
  {
    key: "guide",
    eyebrow: "The mountain",
    question: "One day with a private guide — first tracks, no lift lines. Interested?",
    detail: "Your pace, your terrain, the mountain before anyone else.",
    yesLabel: "Interested",
    passLabel: "Not this trip",
    serviceSlug: "private-ski-guide",
    interestLabel: "Private guide",
  },
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
