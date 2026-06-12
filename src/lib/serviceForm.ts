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

export type WizardStep = {
  key: string;
  /** Quiet uppercase eyebrow above the serif question. */
  eyebrow: string;
  /** The serif headline — an elegant host asking, not a form labeling. */
  question: string;
  /** One quiet supporting line under the question. */
  detail?: string;
  fields: ServiceField[];
};

export type ServiceFlowConfig = {
  steps: WizardStep[];
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
        detail: "We track it — early, delayed, your driver is already adjusted.",
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
        detail: "We'll have the right vehicle waiting — that part's on us.",
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
        detail: "A few details per person — the gear's fitted and waiting in the mudroom.",
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
        detail: "Sized and ready at the residence — no shop stop.",
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

  "grocery-pre-stock": {
    steps: [
      {
        key: "package",
        eyebrow: "The kitchen",
        question: "How should we stock it?",
        detail: "Built by people who know what a mountain morning needs.",
        fields: [
          {
            kind: "select",
            name: "package",
            label: "Stocking",
            options: [
              "The Essentials — coffee, breakfast, fruit, snacks, water",
              "The Family Table — the Essentials, doubled, plus kids' staples",
              "Après — charcuterie, wine, fireside things",
              "Tailored — tell us below",
            ],
            required: true,
          },
        ],
      },
      {
        key: "dietary",
        eyebrow: "The table",
        question: "Anything we should know about the table?",
        fields: [
          {
            kind: "text",
            name: "dietary",
            label: "Allergies & dietary notes",
            placeholder: "Gluten-free household, nut allergy — or none",
          },
        ],
      },
    ],
    notesPrompt: "Anything particular?",
    notesPlaceholder: "Brands you love, oat milk not dairy, ribeyes for Thursday…",
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
        detail: "A menu built around your table — we just need the lean.",
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
            placeholder: "Allergies, dislikes — “none” is an answer we like too",
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

/**
 * Config-driven completeness — the gate that advances SIGNALED onward.
 * Required plain fields must be present; perPerson groups need every
 * required subfield for each of `partySize` people.
 */
export function isFlowComplete(
  config: ServiceFlowConfig,
  details: RequestDetail[],
  partySize: number,
): boolean {
  for (const step of config.steps) {
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
