/**
 * Money is stored as integer cents + a currency code everywhere.
 * One formatter, used by the tab, catalog prices, and confirmations.
 */

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Catalog price label, e.g. "from $850", "$120 / hour", "Quoted on request".
 * Mirrors the Service.priceUnit + priceNote shape.
 */
export function formatPriceLabel(
  amountCents: number | null,
  unit:
    | "FLAT"
    | "PER_HOUR"
    | "PER_DAY"
    | "PER_PERSON"
    | "QUOTE",
  note?: string | null,
  currency = "usd",
): string {
  if (unit === "QUOTE" || amountCents == null) {
    return note?.trim() ? note : "Quoted on request";
  }

  const base = formatMoney(amountCents, currency);
  // `unit` is narrowed to exclude QUOTE by the early return above.
  const suffix: Record<typeof unit, string> = {
    FLAT: "",
    PER_HOUR: " / hour",
    PER_DAY: " / day",
    PER_PERSON: " / person",
  };
  const prefix = note?.trim() ? `${note} ` : "";
  return `${prefix}${base}${suffix[unit]}`;
}
