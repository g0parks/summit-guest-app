/**
 * Execution schemas — the per-service guided-completion flows (Product
 * Doctrine 2026-06-12). Each service is a chef-designed offering with a few
 * structured asks and mild substitution points — NEVER a configurator.
 * "Parameters, not solutions": we ask party + bags, Summit picks the car.
 *
 * The wizard (src/app/(trip)/requests/[requestId]) renders one step per
 * screen in the /plan register; answers land in `ServiceRequest.detailsJson`
 * as [{name, label, value}] (the legacy {label, value} shape stays readable
 * for ops). Completeness — `isFlowComplete()` — is what advances a SIGNALED
 * request to READY / auto-confirm; it is config-driven, not bespoke.
 *
 * Still demo-level config by design: definitions live in code; real vendor
 * fulfillment params will reshape these. No `server-only` — the client
 * wizard imports these directly (plain data + pure functions only).
 */

export type SubField =
  | {
      kind: "select";
      name: string;
      label: string;
      options: string[];
      required?: boolean;
      /** Pre-selected option when nothing is saved (e.g. kit-box "default on"). */
      default?: string;
    }
  | {
      kind: "text";
      name: string;
      label: string;
      placeholder?: string;
      required?: boolean;
    };

export type ServiceField =
  | SubField
  | {
      kind: "textarea";
      name: string;
      label: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      /** Multi-pick parameters (bags, car seats…) — never required. */
      kind: "checkboxes";
      name: string;
      label: string;
      options: string[];
    }
  | {
      /**
       * A labeled group repeated once per party member (ski fittings,
       * bike sizing). Rendered one person per screen. Count follows the
       * request's party size (the service should set requiresPartySize).
       */
      kind: "perPerson";
      name: string;
      label: string;
      /** "rider", "guest" — used for headings: "Rider 2". */
      personNoun: string;
      fields: SubField[];
    };

/**
 * Conditional rendering predicate — "show this only if an earlier answer
 * equals X." `field` is a prior step's machine name (by `name`); the match
 * is exact equality. Equals-only by design (no "not"/"in"). A step/offer with
 * no `showIf` always shows. The SAME predicate gates the client wizard
 * (RequestWizard), the server's detail collection (requests.ts), and
 * completeness (isFlowComplete/missingSummary) — one source of truth so a
 * hidden step is never required of a guest who never saw it.
 *
 * A `ShowIf[]` is AND — every clause must match (the bar's moments gate on
 * mode AND a trip signal; the extension the equals-only note anticipated).
 * `field` may name a trip-derived SEED (phase, cookOrChef) injected as a
 * read-only visibility input, not a guest answer — that's how "which moments
 * surface" reads the room without pre-filling the order.
 */
export type ShowIf = { field: string; equals: string };
export type ShowIfPredicate = ShowIf | ShowIf[];

export type WizardStep = {
  key: string;
  /** Quiet uppercase eyebrow above the serif question. */
  eyebrow: string;
  /** The serif headline — an elegant host asking, not a form labeling. */
  question: string;
  /** One quiet supporting line under the question. */
  detail?: string;
  /** Render + count this step only when a prior answer / seed matches (AND across an array). */
  showIf?: ShowIfPredicate;
  fields: ServiceField[];
};

/**
 * A cross-sell offer that, when opted into, spawns a SIBLING request for
 * another service (cook-in → chef). The opt-in IS the demand signal: the
 * sibling is created SIGNALED — logged, resumeable from the home checklist,
 * and enrolled in the ops nudge queue — the instant the guest ticks it, even
 * on a graceful "finish later" exit. Never pre-checked (the crook test:
 * an offer, never a trap). `source` attributes the demand in the Broker's
 * Book. Distinct from a plain nav link to another service.
 */
export type AttachOffer = {
  /** Submitted as `attach_<name>` when the guest opts in. */
  name: string;
  /** Slug of the service to spawn as a sibling SIGNALED request. */
  targetSlug: string;
  /** ServiceRequest.source on the spawned sibling (Broker's Book attribution). */
  source: string;
  eyebrow: string;
  question: string;
  detail?: string;
  /** The opt-in checkbox label. */
  cta: string;
  /** Offer this only when a prior answer / seed matches (AND across an array). */
  showIf?: ShowIfPredicate;
};

export type ServiceFlowConfig = {
  steps: WizardStep[];
  /** Quiet end-of-flow cross-sell offers (spawn siblings on opt-in). */
  attaches?: AttachOffer[];
  /** Overrides the closing "anything else" notes prompt. */
  notesPrompt?: string;
  notesPlaceholder?: string;
};

const MAX_PARTY = 8;

const FLOWS: Record<string, ServiceFlowConfig> = {
  "airport-transfer-slc": {
    steps: [
      {
        key: "direction",
        eyebrow: "The drive",
        question: "Which way are we driving?",
        fields: [
          {
            kind: "select",
            name: "direction",
            label: "Direction",
            options: ["Airport → residence", "Residence → airport", "Round trip"],
            required: true,
          },
        ],
      },
      {
        key: "flight",
        eyebrow: "Your flight",
        question: "What's the flight number?",
        detail: "We track it. Early or delayed, your driver is already adjusted.",
        fields: [
          {
            kind: "text",
            name: "flightNumber",
            label: "Flight number",
            placeholder: "DL 920",
            required: true,
          },
        ],
      },
      {
        key: "luggage",
        eyebrow: "The load",
        question: "Anything riding along?",
        detail: "We'll have the right vehicle waiting.",
        fields: [
          {
            kind: "checkboxes",
            name: "luggage",
            label: "Riding along",
            options: ["Ski or snowboard bags", "Extra luggage", "Child car seats"],
          },
        ],
      },
    ],
    notesPlaceholder: "Anything else about the drive…",
  },

  "ski-rental": {
    steps: [
      {
        key: "riders",
        eyebrow: "The fittings",
        question: "Who's skiing?",
        detail: "A few details per person, and the gear's fitted and waiting in the mudroom.",
        fields: [
          {
            kind: "perPerson",
            name: "rider",
            label: "Rider",
            personNoun: "Rider",
            fields: [
              { kind: "text", name: "name", label: "First name", required: true },
              { kind: "text", name: "height", label: "Height", placeholder: "5'10\"", required: true },
              { kind: "text", name: "weight", label: "Weight", placeholder: "170 lbs", required: true },
              { kind: "text", name: "shoeSize", label: "Shoe size", placeholder: "10.5", required: true },
              {
                kind: "select",
                name: "ability",
                label: "On the mountain",
                options: ["Beginner", "Intermediate", "Advanced", "Expert"],
                required: true,
              },
              {
                kind: "select",
                name: "setup",
                label: "Setup",
                options: ["Skis", "Snowboard"],
                required: true,
              },
            ],
          },
        ],
      },
    ],
    notesPlaceholder: "Powder skis, helmets for the kids, anything at all…",
  },

  "bike-rental": {
    steps: [
      {
        key: "riders",
        eyebrow: "The fittings",
        question: "Who's riding?",
        detail: "Sized and ready at the residence. No shop stop.",
        fields: [
          {
            kind: "perPerson",
            name: "rider",
            label: "Rider",
            personNoun: "Rider",
            fields: [
              { kind: "text", name: "name", label: "First name", required: true },
              { kind: "text", name: "height", label: "Height", placeholder: "5'10\"", required: true },
              {
                kind: "select",
                name: "bike",
                label: "The ride",
                options: ["Mountain", "E-bike", "Road", "Cruiser"],
                required: true,
              },
              {
                kind: "select",
                name: "experience",
                label: "Comfort level",
                options: ["Easy cruiser", "Confident", "Send it"],
                required: true,
              },
            ],
          },
        ],
      },
    ],
    notesPlaceholder: "Trailers, kid seats, where you're headed…",
  },

  // Grocery is an INTAKE, not a catalog (Two-Heroes doctrine): a store/brand-
  // agnostic front, a curated package spine, and freeform particulars — a
  // human fulfills. Dual-mode (guided OR "just send a list"), never trapped:
  // the `mode` fork gates the two lanes via showIf; both land the same
  // detailsJson shape. Package contents are placeholder copy (Sam finalizes).
  "grocery-pre-stock": {
    steps: [
      // ── Step 0: the fork — build together, or just send a list ──
      {
        key: "mode",
        eyebrow: "The kitchen",
        question: "Shall we build it with you, or would you rather just send a list?",
        detail: "Either way, it's put away before you walk in.",
        fields: [
          {
            kind: "select",
            name: "mode",
            label: "How we'll do it",
            options: ["Build it with us", "I'll send a list"],
            required: true,
          },
        ],
      },

      // ── Guided lane ──────────────────────────────────────────────
      {
        key: "package",
        showIf: { field: "mode", equals: "Build it with us" },
        eyebrow: "The stocking",
        question: "Where should we start?",
        detail: "Built by people who know what a mountain morning needs.",
        fields: [
          {
            kind: "select",
            name: "package",
            label: "Stocking",
            options: [
              "Essentials · coffee, breakfast, fruit, snacks, water",
              "Family Table · the Essentials doubled, plus kids' staples",
              "Après · charcuterie, wine, fireside things",
              "Local Utah · the best of the valley's makers",
              "Tailored · tell us below",
            ],
            required: true,
          },
        ],
      },
      {
        key: "kit",
        showIf: { field: "mode", equals: "Build it with us" },
        eyebrow: "The basics",
        question: "We'll tuck in the basics: salt, pepper, oil, foil, coffee filters.",
        detail: "Leave it on, or skip if the kitchen's already set.",
        fields: [
          {
            kind: "select",
            name: "kitBox",
            label: "The starter kit",
            options: ["Yes, include it", "No need"],
            default: "Yes, include it",
          },
        ],
      },
      {
        key: "cookIn",
        showIf: { field: "mode", equals: "Build it with us" },
        eyebrow: "The plan",
        question: "Cooking in, or just provisions and the basics?",
        fields: [
          {
            kind: "select",
            name: "cookIn",
            label: "The kitchen plan",
            options: ["Cooking in", "Just provisions"],
            // Required so the chef cross-attach (gated on "Cooking in") can't be
            // silently suppressed by a guest who skips an optional fork.
            required: true,
          },
        ],
      },
      {
        key: "cooking",
        showIf: { field: "cookIn", equals: "Cooking in" },
        eyebrow: "The menu",
        question: "What are you thinking of making?",
        detail: "We'll make sure the basics cover those dishes.",
        fields: [
          {
            kind: "textarea",
            name: "cookingPlans",
            label: "On the menu",
            placeholder: "Pasta night, taco Tuesday, a big breakfast spread…",
          },
        ],
      },
      {
        key: "particulars",
        showIf: { field: "mode", equals: "Build it with us" },
        eyebrow: "The particulars",
        question: "The handful of things that must be there?",
        detail: "Brands you love, the wine, anything to keep clear of.",
        fields: [
          {
            kind: "textarea",
            name: "particulars",
            label: "Particulars",
            placeholder: "Oat milk not dairy, the good olive oil, nut allergy…",
          },
        ],
      },

      // ── Freeform lane ────────────────────────────────────────────
      {
        key: "list",
        showIf: { field: "mode", equals: "I'll send a list" },
        eyebrow: "Your list",
        question: "Tell us what you need and we'll handle the rest.",
        detail: "However it comes to you: brands, rough quantities, the general idea.",
        fields: [
          {
            kind: "textarea",
            name: "list",
            label: "Your list",
            placeholder: "Coffee, eggs, the kids' cereal, a few good bottles of red…",
            required: true,
          },
        ],
      },
      {
        key: "freeformDietary",
        showIf: { field: "mode", equals: "I'll send a list" },
        eyebrow: "The table",
        question: "Anything we should know about the table?",
        fields: [
          {
            kind: "text",
            name: "dietary",
            label: "Allergies & dietary notes",
            placeholder: "Gluten-free household, nut allergy, or none",
          },
        ],
      },
      {
        key: "freeformKit",
        showIf: { field: "mode", equals: "I'll send a list" },
        eyebrow: "The basics",
        question: "Want us to tuck in the basics too?",
        detail: "Salt, pepper, oil, foil, coffee filters.",
        fields: [
          {
            kind: "select",
            name: "kitBox",
            label: "The starter kit",
            options: ["Yes, include it", "No need"],
            default: "Yes, include it",
          },
        ],
      },
    ],
    // Cooking in → quietly offer a chef night (the crook, not a trap): the
    // opt-in spawns a SIGNALED private-chef-dinner sibling, source-tagged so
    // the Broker's Book sees grocery as the demand origin.
    attaches: [
      {
        name: "chefNight",
        targetSlug: "private-chef-dinner",
        source: "grocery-upsell",
        showIf: { field: "cookIn", equals: "Cooking in" },
        eyebrow: "While you're at it",
        question: "Want a chef to take one night?",
        detail:
          "A private chef in your kitchen, one night off the hook. The groceries are handled either way.",
        cta: "Yes, start a chef night",
      },
    ],
    notesPrompt: "Anything else?",
    notesPlaceholder: "Timing, where to leave it, anything at all…",
  },

  // The bar is DISCOVERY, not order-taking (Alcohol spec 2026-06-15): the
  // luxury is "I get exactly what I want," and guests don't know what that is
  // until it's evoked. So the primitive is MOMENTS of the stay, each an opt-in
  // tap (never pre-selected — the crook test), and a human curates the
  // bottles. Which moments SURFACE is seeded by trip signals (today: phase —
  // the arrival moment hides once they're in-house) via showIf against
  // read-only seeds — reads the room, never pre-fills the order. The bar
  // stands alone; a chef/cook-in only spawns a bar demand signal via the
  // cross-attach. Dual-mode (full discovery OR "just tell us"),
  // never trapped. Pricing is the fee-structure path (src/lib/provisioningPricing.ts) —
  // the disclosure shows on the confirm surface, never here.
  "bar-stocking": {
    steps: [
      // ── Step 0: the fork — curate together, or just tell us ──
      {
        key: "mode",
        eyebrow: "The bar",
        question: "Shall we curate the bar with you, or would you rather just tell us?",
        detail: "Either way, it's chosen to your taste.",
        fields: [
          {
            kind: "select",
            name: "mode",
            label: "How we'll do it",
            options: ["Curate it with us", "Just tell us what we're after"],
            required: true,
          },
        ],
      },

      // ── Guided lane — the moments. Seeded by trip context (which SHOW). ──
      {
        // Arrival only makes sense before they walk in — hidden in-stay.
        key: "arrival",
        showIf: [
          { field: "mode", equals: "Curate it with us" },
          { field: "phase", equals: "PRE_ARRIVAL" },
        ],
        eyebrow: "The arrival",
        question: "A bottle chilling when you walk in?",
        detail: "A toast on the counter, or a special red breathing, waiting when you arrive.",
        fields: [
          {
            kind: "select",
            name: "arrival",
            label: "Set it up?",
            options: ["Yes, have it waiting", "Not this one"],
          },
          {
            kind: "text",
            name: "arrivalNote",
            label: "Anything in mind?",
            placeholder: "Champagne to toast, a big Napa cab, something local…",
          },
        ],
      },
      {
        key: "nightsEnd",
        showIf: { field: "mode", equals: "Curate it with us" },
        eyebrow: "How the nights end",
        question: "Something for how the nights wind down?",
        detail: "Fireside après, a nightcap, cocktails out in the hot tub.",
        fields: [
          {
            kind: "select",
            name: "nightsEnd",
            label: "Set it up?",
            options: ["Yes, sort it", "Not this one"],
          },
          {
            kind: "text",
            name: "nightsEndNote",
            label: "Anything in mind?",
            placeholder: "Old fashioneds, a peaty scotch, margaritas by the tub…",
          },
        ],
      },
      {
        // Wine for the table — shown to everyone curating; NOT gated behind a
        // chef (the bar stands on its own). A chef/cook-in instead spawns a bar
        // demand signal via the cross-attach, and a future chef refinement can
        // make this moment cook-aware.
        key: "dinnerIn",
        showIf: { field: "mode", equals: "Curate it with us" },
        eyebrow: "Dinner in",
        question: "Wine for the table?",
        detail: "The right bottles for what you're cooking, or what the chef is making.",
        fields: [
          {
            kind: "select",
            name: "dinnerIn",
            label: "Set it up?",
            options: ["Yes, pair the table", "Not this one"],
          },
          {
            kind: "text",
            name: "dinnerInNote",
            label: "What's on the menu?",
            placeholder: "Reds for steak night, a crisp white, a magnum to share…",
          },
        ],
      },
      {
        key: "tasteUtah",
        showIf: { field: "mode", equals: "Curate it with us" },
        eyebrow: "A taste of Utah",
        question: "A taste of Utah?",
        detail: "High West, a local brewery, the pour you talk about back home.",
        fields: [
          {
            kind: "select",
            name: "tasteUtah",
            label: "Set it up?",
            options: ["Yes, surprise us", "Not this one"],
          },
          {
            kind: "text",
            name: "tasteUtahNote",
            label: "Anything in mind?",
            placeholder: "A whiskey flight, local IPAs, dealer's choice…",
          },
        ],
      },
      {
        key: "notDrinking",
        showIf: { field: "mode", equals: "Curate it with us" },
        eyebrow: "The ones not drinking",
        question: "Something special for the ones not drinking?",
        detail: "A proper N/A bottle, good mixers, something they'll love.",
        fields: [
          {
            kind: "select",
            name: "notDrinking",
            label: "Set it up?",
            options: ["Yes, include them", "Not this time"],
          },
          {
            kind: "text",
            name: "notDrinkingNote",
            label: "Anything in mind?",
            placeholder: "Fancy N/A bubbles, mocktail makings, the kids' favorites…",
          },
        ],
      },

      // ── Freeform lane — the "just tell us" escape, never trapped ──
      {
        key: "freeform",
        showIf: { field: "mode", equals: "Just tell us what we're after" },
        eyebrow: "The bar",
        question: "Tell us what you're after and we'll take it from there.",
        detail: "However it comes to you: a few bottles, a vibe, a budget.",
        fields: [
          {
            kind: "textarea",
            name: "freeform",
            label: "What you're after",
            placeholder: "A case of good red, tequila for margaritas, a nice N/A option…",
            required: true,
          },
        ],
      },
    ],
    notesPrompt: "Anything else?",
    notesPlaceholder: "Favorites, what to steer clear of, where to leave it…",
  },

  "guided-fly-fishing": {
    steps: [
      {
        key: "experience",
        eyebrow: "The water",
        question: "How much time have you spent on the water?",
        fields: [
          {
            kind: "select",
            name: "experience",
            label: "Experience",
            options: ["First time", "Some experience", "Seasoned"],
            required: true,
          },
        ],
      },
    ],
    notesPlaceholder: "Dry flies only, kids along, a stretch you've dreamed about…",
  },

  "private-ski-guide": {
    steps: [
      {
        key: "ability",
        eyebrow: "The mountain",
        question: "How does the group ski?",
        fields: [
          {
            kind: "select",
            name: "ability",
            label: "Group ability",
            options: ["Beginner", "Intermediate", "Advanced", "Expert"],
            required: true,
          },
        ],
      },
      {
        key: "goals",
        eyebrow: "The day",
        question: "What would make the day?",
        fields: [
          {
            kind: "text",
            name: "goals",
            label: "Goals",
            placeholder: "First tracks, trees, teach the kids…",
          },
        ],
      },
    ],
  },

  "in-residence-massage": {
    // styles grounded in Park City in-home menus (Alpenglow, Mellow Mountain)
    steps: [
      {
        key: "style",
        eyebrow: "The treatment",
        question: "What kind of work?",
        fields: [
          {
            kind: "select",
            name: "style",
            label: "Style",
            options: ["Swedish", "Deep tissue", "Hot stone", "Prenatal", "Lymphatic drainage"],
            required: true,
          },
          {
            kind: "select",
            name: "duration",
            label: "Length",
            options: ["60 minutes", "90 minutes", "120 minutes"],
            required: true,
          },
        ],
      },
    ],
    notesPlaceholder: "Focus areas, pressure, who's first…",
  },

  "private-chef-dinner": {
    steps: [
      {
        key: "menu",
        eyebrow: "The menu",
        question: "Which direction should the chef take?",
        detail: "A menu built around your table. We just need the lean.",
        fields: [
          {
            kind: "select",
            name: "menu",
            label: "Menu direction",
            options: ["Chef's choice", "Alpine comfort", "Mediterranean", "Japanese", "Plant-forward"],
            required: true,
          },
        ],
      },
      {
        key: "dietary",
        eyebrow: "The table",
        question: "Anything the chef should know?",
        fields: [
          {
            kind: "textarea",
            name: "dietary",
            label: "Allergies & dietary notes",
            placeholder: "Allergies, dislikes, or “none” works too",
            required: true,
          },
        ],
      },
    ],
    notesPlaceholder: "Occasion, kids' plates, timing…",
  },

  "sommelier-wine-pairing": {
    steps: [
      {
        key: "cellar",
        eyebrow: "The cellar",
        question: "Which way does the table lean?",
        fields: [
          {
            kind: "text",
            name: "preferences",
            label: "Cellar direction",
            placeholder: "Burgundy, big cabs, happy to be surprised…",
          },
        ],
      },
    ],
  },

  "daily-housekeeping": {
    steps: [
      {
        key: "window",
        eyebrow: "The rhythm",
        question: "When should we slip in?",
        fields: [
          {
            kind: "select",
            name: "window",
            label: "Preferred window",
            options: ["Morning", "Midday", "Afternoon"],
            required: true,
          },
        ],
      },
    ],
    notesPlaceholder: "Rooms to skip, pets, anything fragile…",
  },

  "backcountry-heli-day": {
    steps: [
      {
        key: "ability",
        eyebrow: "The terrain",
        question: "How does the group ride?",
        fields: [
          {
            kind: "select",
            name: "ability",
            label: "Group ability",
            options: ["Intermediate", "Advanced", "Expert"],
            required: true,
          },
        ],
      },
    ],
    notesPlaceholder: "Powder days logged, gear you own, nerves…",
  },

  // sunset-ebike-tour: scheduling + notes covers it — no config needed
};

/** The flow for a service — empty steps mean scheduling + notes only. */
export function serviceFlow(slug: string): ServiceFlowConfig {
  return FLOWS[slug] ?? { steps: [] };
}

/* ── Detail values: naming, parsing, completeness ─────────────────────────
 * Stored shape: [{name, label, value}]. `name` is the machine key the wizard
 * rehydrates from ("flightNumber", "rider_2_height"); `label` is what ops
 * reads ("Rider 2 · Height"). parseRequestDetails tolerates legacy rows
 * without `name`.
 */

export type RequestDetail = { name?: string; label: string; value: string };

export function parseRequestDetails(json: unknown): RequestDetail[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (d): d is RequestDetail =>
      typeof d === "object" &&
      d !== null &&
      typeof (d as RequestDetail).label === "string" &&
      typeof (d as RequestDetail).value === "string",
  );
}

/** Machine key for a per-person subfield: rider_1_height (1-based). */
export function perPersonName(groupName: string, person: number, sub: string): string {
  return `${groupName}_${person}_${sub}`;
}

/** Clamp a party size to something the wizard can render. */
export function clampParty(partySize: number | null | undefined): number {
  return Math.min(Math.max(1, partySize ?? 1), MAX_PARTY);
}

function valueOf(details: RequestDetail[], name: string): string {
  return details.find((d) => d.name === name)?.value?.trim() ?? "";
}

/** Answer lookup (machine name → value) for evaluating showIf predicates. */
export function flowAnswers(details: RequestDetail[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of details) {
    if (d.name) out[d.name] = d.value;
  }
  return out;
}

/** A step/offer with no showIf always shows; an array is AND across clauses. */
export function showIfMatches(
  showIf: ShowIfPredicate | undefined,
  answers: Record<string, string>,
): boolean {
  if (!showIf) return true;
  const clauses = Array.isArray(showIf) ? showIf : [showIf];
  return clauses.every((c) => (answers[c.field]?.trim() ?? "") === c.equals);
}

/** Every field name any clause of a predicate references — for the wizard's
 *  controlled-input set (a controller re-derives the screen list live). */
export function showIfFields(showIf: ShowIfPredicate | undefined): string[] {
  if (!showIf) return [];
  return (Array.isArray(showIf) ? showIf : [showIf]).map((c) => c.field);
}

export function stepVisible(step: WizardStep, answers: Record<string, string>): boolean {
  return showIfMatches(step.showIf, answers);
}

export function attachVisible(attach: AttachOffer, answers: Record<string, string>): boolean {
  return showIfMatches(attach.showIf, answers);
}

/**
 * Config-driven completeness — the gate that advances SIGNALED onward.
 * Required plain fields must be present; perPerson groups need every
 * required subfield for each of `partySize` people. HIDDEN steps (showIf
 * unmatched) are skipped entirely — we never require an answer the guest
 * never saw. showIf is evaluated against the answers we already have, walked
 * in step order so chained gates resolve (mode → reveals cookIn → reveals
 * "what are you making").
 */
export function isFlowComplete(
  config: ServiceFlowConfig,
  details: RequestDetail[],
  partySize: number,
  seeds: Record<string, string> = {},
): boolean {
  const answers = { ...seeds, ...flowAnswers(details) };
  for (const step of config.steps) {
    if (!stepVisible(step, answers)) continue;
    for (const field of step.fields) {
      if (field.kind === "perPerson") {
        for (let p = 1; p <= clampParty(partySize); p++) {
          for (const sub of field.fields) {
            if (sub.required && !valueOf(details, perPersonName(field.name, p, sub.name))) {
              return false;
            }
          }
        }
      } else if (field.kind !== "checkboxes" && field.required) {
        if (!valueOf(details, field.name)) return false;
      }
    }
  }
  return true;
}

/**
 * What's still missing before a SIGNALED request can advance — the ops-queue
 * badge text ("date + 4 details"). Same walk as isFlowComplete, summarized
 * for an operator's glance. Everything present = the guest just never hit
 * send ("just the send").
 */
export function missingSummary(
  config: ServiceFlowConfig,
  details: RequestDetail[],
  partySize: number,
  missingDate: boolean,
  seeds: Record<string, string> = {},
): string {
  const answers = { ...seeds, ...flowAnswers(details) };
  let missing = 0;
  for (const step of config.steps) {
    if (!stepVisible(step, answers)) continue;
    for (const field of step.fields) {
      if (field.kind === "perPerson") {
        for (let p = 1; p <= clampParty(partySize); p++) {
          for (const sub of field.fields) {
            if (sub.required && !valueOf(details, perPersonName(field.name, p, sub.name))) {
              missing++;
            }
          }
        }
      } else if (field.kind !== "checkboxes" && field.required) {
        if (!valueOf(details, field.name)) missing++;
      }
    }
  }

  const bits: string[] = [];
  if (missingDate) bits.push("date");
  if (missing > 0) bits.push(`${missing} detail${missing === 1 ? "" : "s"}`);
  return bits.length > 0 ? bits.join(" + ") : "just the send";
}
