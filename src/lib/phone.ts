/**
 * Phone normalization — ONE shape in the DB (E.164, "+14355550100") so the
 * SMS consent record is bound to a stable value and Track B's programmatic
 * sender (Twilio) never has to guess at formatting. Pure + client-safe (no
 * `server-only`): capture forms may reuse it.
 *
 * Tolerates how humans actually type numbers: "+1 (435) 555-0100",
 * "435-555-0100" (bare US 10-digit → +1), "1 435 555 0100". Anything that
 * doesn't resolve returns null — callers decide whether that's an error
 * (consent gates) or a keep-as-typed (optional contact fields).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const cleaned = (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, "");
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned; // already E.164
  const digits = cleaned.replace(/^\+/, "");
  if (/^\d{10}$/.test(digits)) return `+1${digits}`; // bare US 10-digit
  if (/^1\d{10}$/.test(digits)) return `+${digits}`; // "1" + US 10-digit
  return null;
}

/** Normalize when possible, keep the typed value when not — for OPTIONAL
 *  contact fields where rejecting an odd-but-real number would lose a lead. */
export function normalizePhoneOrKeep(raw: string | null): string | null {
  if (!raw) return null;
  return normalizePhone(raw) ?? raw;
}
