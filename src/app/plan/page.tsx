import { getActiveStay } from "@/lib/session";
import { getConciergeContact, intakeFollowupMessage } from "@/lib/concierge";
import { formatDateRange } from "@/lib/dates";
import IntakeFlow from "@/components/intake/IntakeFlow";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Plan your stay — Summit",
};

/**
 * The pre-arrival entry experience (/plan) — a guided, presupposing-register
 * conversation that plans the stay. PUBLIC: this is the link in the
 * pre-arrival text/email. World B (anonymous lead) by default; if a signed
 * token session exists (World A), the welcome personalizes and the contact
 * screen disappears — never ask what we already know.
 *
 * UTM params ride along for attribution only — never access (CLAUDE.md rule).
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const utm: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k.startsWith("utm_") && typeof v === "string") utm[k] = v;
  }
  const source = typeof params.src === "string" ? params.src : null;

  const active = await getActiveStay();
  const concierge = getConciergeContact();

  return (
    <IntakeFlow
      knownStay={
        active
          ? {
              guestFirstName: active.stay.guest.firstName,
              propertyName: active.stay.property.name,
              dateRange: formatDateRange(
                active.stay.arrivalDate,
                active.stay.departureDate,
                active.stay.property.timezone,
              ),
            }
          : null
      }
      utm={Object.keys(utm).length > 0 ? utm : null}
      source={source}
      conciergePhone={concierge.phone}
      conciergeEmail={concierge.email}
      conciergeMessage={intakeFollowupMessage()}
    />
  );
}
