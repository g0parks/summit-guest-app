/**
 * Vendor cost captured at quote time has nowhere structural to live: the tab
 * line it belongs on isn't created until the guest approves (quoteRequest →
 * approveQuote), and ServiceRequest carries no economics column. So it rides
 * `operatorNote` — an ops-only surface — as a parseable line, then lands on
 * the TabLineItem as internal economics when approval creates the line.
 * Parse failure degrades to null (economics settable later per-line, as
 * always). Replace with a real column if quoting grows more state.
 */

const VENDOR_LINE = /(?:^|\n)Vendor cost: \$?([\d,]+(?:\.\d{1,2})?)[^\n]*/;

/** Append (or replace) the vendor-cost line on an operator note. */
export function withVendorCostNote(
  existing: string | null,
  vendorCostCents: number,
): string {
  const line = `Vendor cost: $${(vendorCostCents / 100).toFixed(2)}`;
  const stripped = (existing ?? "").replace(VENDOR_LINE, "").trim();
  return stripped ? `${stripped}\n${line}` : line;
}

/** Read the stashed vendor cost back, in cents; null when absent/unreadable. */
export function parseVendorCostNote(note: string | null): number | null {
  const m = note?.match(VENDOR_LINE);
  if (!m?.[1]) return null;
  const cents = Math.round(Number.parseFloat(m[1].replace(/,/g, "")) * 100);
  return Number.isFinite(cents) && cents >= 0 ? cents : null;
}
