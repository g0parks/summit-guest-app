import type { Partner } from "@prisma/client";

/**
 * Co-brand resolution — the ONE place display branding is decided.
 * Partner present + active → "[Partner] Concierge, powered by Summit"
 * (PM brand primary, Summit quiet). No partner → pure Summit, exactly
 * the original look. Theming is data-driven and hot-swappable per
 * partner; never hard-code a partner anywhere else.
 */

export type Brand = {
  /** Wordmark text: "<partner> Concierge" or "SUMMIT". */
  label: string;
  /** True when co-branded — render the quiet "powered by Summit" line. */
  poweredBy: boolean;
  accentColor: string | null;
  logoUrl: string | null;
};

const SUMMIT: Brand = {
  label: "SUMMIT",
  poweredBy: false,
  accentColor: null,
  logoUrl: null,
};

export function resolveBrand(
  property: { partner: Partner | null } | null | undefined,
): Brand {
  const partner = property?.partner;
  if (!partner || !partner.isActive) return SUMMIT;
  return {
    label: partner.conciergeLabel ?? `${partner.name} Concierge`,
    poweredBy: true,
    accentColor: partner.accentColor,
    logoUrl: partner.logoUrl,
  };
}

/**
 * CSS custom properties for the (trip) layout wrapper. Overrides the SAME
 * variables globals.css defines (--accent / --accent-pressed / --accent-tint),
 * deriving the pressed + tint shades from the one partner accent token.
 * No partner accent → undefined → zero inline style, pixel-identical default.
 */
export function brandCssVars(brand: Brand): Record<string, string> | undefined {
  const hex = parseHex(brand.accentColor);
  if (!hex) return undefined;
  return {
    "--accent": toHex(hex), // normalized (lowercase, leading #)
    "--accent-pressed": toHex(darken(hex, 0.18)),
    "--accent-tint": toHex(mix(hex, [0xf7, 0xf3, 0xec], 0.88)), // wash toward the ivory canvas
  };
}

type Rgb = [number, number, number];

function parseHex(raw: string | null): Rgb | null {
  if (!raw) return null;
  const m = raw.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m || !m[1]) return null;
  const v = Number.parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function darken([r, g, b]: Rgb, k: number): Rgb {
  return [r * (1 - k), g * (1 - k), b * (1 - k)] as Rgb;
}

/** Linear mix from `from` toward `to` by `k` (0 = from, 1 = to). */
function mix(from: Rgb, to: Rgb, k: number): Rgb {
  return [0, 1, 2].map((i) => (from[i] ?? 0) * (1 - k) + (to[i] ?? 0) * k) as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;
}
