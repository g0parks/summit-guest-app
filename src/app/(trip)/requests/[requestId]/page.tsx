import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStay } from "@/lib/session";
import { getBarSeeds, getRequestForWizard } from "@/lib/queries";
import { parseRequestDetails } from "@/lib/serviceForm";
import { barCadence, describeBarFees, isFeeStructureService } from "@/lib/barPricing";
import { dayKey, timeValue } from "@/lib/dates";
import { getStayPhase } from "@/lib/stayPhase";
import RequestWizard from "@/components/requests/RequestWizard";
import ApproveQuote from "@/components/requests/ApproveQuote";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

/**
 * The guided completion wizard — where a one-tap signal becomes an
 * execution-ready order, and the resumable surface nudges deep-link to.
 * Open statuses (SIGNALED/READY) render the wizard; QUOTED renders the
 * approval moment; everything later renders a calm status screen — the
 * guest never edits a priced order.
 */
export default async function RequestPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const { stay } = await requireStay();
  const request = await getRequestForWizard(stay.id, requestId);
  if (!request || !request.service) notFound();
  const service = request.service;
  const tz = stay.property.timezone;
  const postStay = getStayPhase(stay, tz) === "POST_STAY";

  if (!postStay && (request.status === "SIGNALED" || request.status === "READY")) {
    const details: Record<string, string> = {};
    for (const d of parseRequestDetails(request.detailsJson)) {
      if (d.name) details[d.name] = d.value;
    }

    // Bar (fee-structure): which moments surface is seeded by trip signals,
    // and the confirm screen discloses the fee SHAPE for the derived cadence.
    const isBar = isFeeStructureService(service.slug);
    const seeds = isBar ? await getBarSeeds(stay, tz) : {};
    const feeStructure = isBar
      ? {
          lines: describeBarFees(
            barCadence({ phase: getStayPhase(stay, tz), now: new Date(), tz }),
          ),
        }
      : null;

    return (
      <RequestWizard
        requestId={request.id}
        service={{
          slug: service.slug,
          name: service.name,
          priceUnit: service.priceUnit,
          priceAmount: service.priceAmount,
          requiresDate: service.requiresDate,
          requiresTime: service.requiresTime,
          requiresPartySize: service.requiresPartySize,
        }}
        currency={stay.currency}
        backHref={`/services/${service.slug}`}
        defaults={{
          date: request.requestedFor ? dayKey(request.requestedFor, tz) : null,
          time: request.requestedFor ? timeValue(request.requestedFor, tz) : null,
          partySize: request.partySize ?? stay.partySize ?? 2,
          notes: request.notes,
          details,
        }}
        seeds={seeds}
        feeStructure={feeStructure}
      />
    );
  }

  // ── QUOTED: the approval moment — the guest's yes creates the tab line ──
  if (!postStay && request.status === "QUOTED" && request.quotedAmount != null) {
    return (
      <ApproveQuote
        requestId={request.id}
        serviceName={service.name}
        amountCents={request.quotedAmount}
        currency={stay.currency}
      />
    );
  }

  // ── Closed / in-flight: a status screen, not a form ──
  const status = postStay
    ? {
        headline: "Your stay has wrapped.",
        detail: "We'd love to arrange this for your next one — the line never closes.",
      }
    : request.status === "QUOTED"
      ? {
          headline: "Being arranged.",
          detail: "Your concierge is pricing it — you'll hear from us shortly.",
        }
      : request.status === "CONFIRMED" || request.status === "SCHEDULED"
        ? {
            headline: "Confirmed.",
            detail: `${service.name} is arranged — you'll find it on your itinerary.`,
          }
        : request.status === "COMPLETED"
          ? {
              headline: "All done.",
              detail: `${service.name} is settled on your tab.`,
            }
          : {
              headline: "This one's closed.",
              detail: "Anything else you'd like arranged, the concierge is right there.",
            };

  return (
    <main className={styles.page}>
      <div className={`${styles.body} reveal reveal-1`}>
        <span className="eyebrow">{service.name}</span>
        <h1 className={styles.headline}>{status.headline}</h1>
        <p className={styles.detail}>{status.detail}</p>
        <div className={styles.links}>
          <Link href="/itinerary" className={styles.quietLink}>
            View your itinerary
          </Link>
          <Link href="/" className={styles.quietLink}>
            Back to your trip
          </Link>
        </div>
      </div>
    </main>
  );
}
