import { getActiveStay } from "@/lib/session";
import { resolveBrand } from "@/lib/branding";
import { getConciergeContact, intakeFollowupMessage } from "@/lib/concierge";
import { formatDateRange } from "@/lib/dates";
import { getRequestedServiceSlugs } from "@/lib/queries";
import { getStayPhase, seasonForDate, staySeason } from "@/lib/stayPhase";
import { intakeQuestionsFor, RENTAL_CAR_QUESTION } from "@/lib/intakeFlow";
import IntakeFlow from "@/components/intake/IntakeFlow";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Plan your stay · Summit",
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

  // Season-aware questions (Menu Doctrine): World A from the stay's dates,
  // World B from today's — no "skis fitted and waiting" for a July stay.
  const season = active
    ? staySeason(active.stay, active.stay.property.timezone)
    : seasonForDate(new Date());

  // Signal-awareness (World A): never ask about an essential the stay already
  // has in motion or done — the guest who confirmed a transfer shouldn't be
  // asked whether a car should be waiting. Declined/cancelled/expired demand
  // stays askable (re-capture is legitimate).
  let questions = intakeQuestionsFor(season);
  if (active) {
    const haveSlugs = await getRequestedServiceSlugs(active.stay.id);
    questions = questions.filter((q) => !haveSlugs.has(q.serviceSlug));
  }

  // The rental-car parameter writes to Stay.hasRentalCar, so we only ask it
  // for a known stay that's still ahead of / during the trip (World A,
  // not departed) — and only when it hasn't been answered anywhere yet
  // (the home card writes the same fact).
  const captureRentalCar =
    active != null &&
    active.stay.hasRentalCar == null &&
    getStayPhase(active.stay, active.stay.property.timezone) !== "POST_STAY";

  return (
    <IntakeFlow
      questions={questions}
      rentalCarQuestion={captureRentalCar ? RENTAL_CAR_QUESTION : null}
      brand={active ? resolveBrand(active.stay.property) : null}
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
