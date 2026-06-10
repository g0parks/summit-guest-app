/**
 * Per-service fulfillment fields for the request form, keyed by service slug.
 *
 * DEMO-LEVEL SCAFFOLDING (deliberate): definitions live in code, answers land
 * in `ServiceRequest.detailsJson` as a plain [{label, value}] bag. When real
 * vendor fulfillment is wired, these params will be vendor-driven and likely
 * move into data — don't over-invest here, just keep the demo feeling real.
 *
 * No `server-only`: the client RequestForm receives these as props and the
 * shapes are plain serializable objects.
 */

export type ServiceField =
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
    }
  | {
      kind: "textarea";
      name: string;
      label: string;
      placeholder?: string;
      required?: boolean;
    };

type ServiceFormConfig = {
  fields: ServiceField[];
  /** Overrides the generic "Allergies, preferences, timing…" notes hint. */
  notesPlaceholder?: string;
};

const CONFIG: Record<string, ServiceFormConfig> = {
  "airport-transfer-slc": {
    fields: [
      {
        kind: "select",
        name: "direction",
        label: "Direction",
        options: ["Airport → residence", "Residence → airport", "Round trip"],
        required: true,
      },
      {
        kind: "text",
        name: "flightNumber",
        label: "Flight number",
        placeholder: "DL 920 — we'll track it",
      },
    ],
    notesPlaceholder: "Car seats, extra luggage, ski bags…",
  },
  "ski-bike-rental": {
    fields: [
      {
        kind: "select",
        name: "gear",
        label: "Gear",
        options: ["Skis", "Snowboards", "Mixed", "Bikes (summer)"],
        required: true,
      },
      {
        kind: "textarea",
        name: "fitting",
        label: "Sizes & ability",
        placeholder: "Heights, weights, boot sizes, ability levels for each rider…",
        required: true,
      },
    ],
  },
  "guided-fly-fishing": {
    fields: [
      {
        kind: "select",
        name: "experience",
        label: "Experience on the water",
        options: ["First time", "Some experience", "Seasoned"],
        required: true,
      },
    ],
  },
  "private-ski-guide": {
    fields: [
      {
        kind: "select",
        name: "ability",
        label: "Ability level",
        options: ["Beginner", "Intermediate", "Advanced", "Expert"],
        required: true,
      },
      {
        kind: "text",
        name: "goals",
        label: "Goals for the day",
        placeholder: "First tracks, trees, teach the kids…",
      },
    ],
  },
  "grocery-pre-stock": {
    fields: [
      {
        kind: "textarea",
        name: "list",
        label: "Your list",
        placeholder: "Coffee, oat milk, berries, ribeyes — brands and quantities welcome…",
        required: true,
      },
      {
        kind: "text",
        name: "dietary",
        label: "Allergies & dietary notes",
        placeholder: "Gluten-free household, nut allergy…",
      },
    ],
    notesPlaceholder: "Where to leave things, fridge vs. pantry…",
  },
  "in-residence-massage": {
    // styles grounded in Park City in-home menus (Alpenglow, Mellow Mountain)
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
    notesPlaceholder: "Focus areas, pressure, who's first…",
  },
  "private-chef-dinner": {
    fields: [
      {
        kind: "select",
        name: "menu",
        label: "Menu direction",
        options: ["Chef's choice", "Alpine comfort", "Mediterranean", "Japanese", "Plant-forward"],
        required: true,
      },
      {
        kind: "textarea",
        name: "dietary",
        label: "Allergies & dietary notes",
        placeholder: "Allergies, dislikes — “none” is an answer we like too",
        required: true,
      },
    ],
    notesPlaceholder: "Occasion, kids' plates, timing…",
  },
  "sommelier-wine-pairing": {
    fields: [
      {
        kind: "text",
        name: "preferences",
        label: "Cellar direction",
        placeholder: "Burgundy, big cabs, happy to be surprised…",
      },
    ],
  },
  "daily-housekeeping": {
    fields: [
      {
        kind: "select",
        name: "window",
        label: "Preferred window",
        options: ["Morning", "Midday", "Afternoon"],
        required: true,
      },
    ],
    notesPlaceholder: "Rooms to skip, pets, anything fragile…",
  },
  "backcountry-heli-day": {
    fields: [
      {
        kind: "select",
        name: "ability",
        label: "Group ability level",
        options: ["Intermediate", "Advanced", "Expert"],
        required: true,
      },
    ],
    notesPlaceholder: "Powder days logged, gear you own, nerves…",
  },
  // sunset-ebike-tour: the generic form (date · time · party · notes) covers it
};

export function serviceFormConfig(slug: string): ServiceFormConfig {
  return CONFIG[slug] ?? { fields: [] };
}

export type RequestDetail = { label: string; value: string };

/** Parse `ServiceRequest.detailsJson` defensively (it's a loose JSON column). */
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
