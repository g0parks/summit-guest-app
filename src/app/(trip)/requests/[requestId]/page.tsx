import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStay } from "@/lib/session";
import { canSms } from "@/lib/consent";
import { getBarSeeds, getRequestForWizard } from "@/lib/queries";
import { parseRequestDetails } from "@/lib/serviceForm";
import {
  BAR_STOCKING_SLUG,
  closedDaysForService,
  describeFeeStructure,
  feeStructureCopy,
  isFeeStructureService,
  resolveFeeConfig,
  sameDayAvailable,
} from "@/lib/provisioningPricing";
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
  if (!request) notFound();
  // `service` is null for a request-box ask — there's no flow to run, so it
  // skips the wizard and shows a status screen / the approve moment instead.
  const service = request.service;
  const title = service?.name ?? request.customTitle ?? "Your request";
  const tz = stay.property.timezone;
  const postStay = getStayPhase(stay, tz) === "POST_STAY";

  if (!postStay && service && (request.status === "SIGNALED" || request.status === "READY")) {
    const details: Record<string, string> = {};
    for (const d of parseRequestDetails(request.detailsJson)) {
      if (d.name) details[d.name] = d.value;
    }

    // Fee-structure (grocery + bar): the confirm screen discloses the concrete
    // fee SCHEDULE; the bar's moments are also seeded by trip signals (phase).
    const isFee = isFeeStructureService(service.priceUnit);
    const seeds = service.slug === BAR_STOCKING_SLUG ? getBarSeeds(stay, tz) : {};
    let feeStructure:
      | (ReturnType<typeof describeFeeStructure> & { closeDetail: string })
      | null = null;
    if (isFee) {
      const phase = getStayPhase(stay, tz);
      const copy = feeStructureCopy(service.slug);
      // The graceful "same-day's wrapped → first thing" line is a bar concern
      // (DABS Sunday + the liquor-store cutoff); grocery makes no same-day
      // promise in copy, so it never shows it.
      const sameDayBlocked =
        service.slug === BAR_STOCKING_SLUG &&
        phase === "IN_STAY" &&
        !sameDayAvailable(new Date(), tz, closedDaysForService(service.slug));
      feeStructure = {
        ...describeFeeStructure({
          noun: copy.noun,
          lead: copy.lead,
          fees: resolveFeeConfig(service),
          sameDayBlocked,
        }),
        closeDetail: copy.closeDetail,
      };
    }

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
        textGate={
          canSms(stay.guest) ? null : { defaultPhone: stay.guest.phone ?? "" }
        }
      />
    );
  }

  // ── QUOTED: the approval moment — the guest's yes creates the tab line ──
  // Works for catalog services AND request-box asks (titled off customTitle).
  if (!postStay && request.status === "QUOTED" && request.quotedAmount != null) {
    return (
      <ApproveQuote
        requestId={request.id}
        serviceName={title}
        amountCents={request.quotedAmount}
        currency={stay.currency}
      />
    );
  }

  // ── Closed / in-flight: a status screen, not a form ──
  const status = postStay
    ? {
        headline: "Your stay has wrapped.",
        detail: "We'd love to arrange this for your next one. The line never closes.",
      }
    : request.status === "SIGNALED" || request.status === "READY"
      ? {
          // Reached only by a service-less request-box ask (catalog services
          // in these states render the wizard above).
          headline: "We've got it.",
          detail: "Your concierge is arranging this. We'll follow up by end of day.",
        }
      : request.status === "QUOTED"
        ? {
            headline: "Being arranged.",
            detail: "Your concierge is pricing it. You'll hear from us shortly.",
          }
        : request.status === "CONFIRMED" || request.status === "SCHEDULED"
          ? {
              headline: "Confirmed.",
              detail: `${title} is arranged, and it's on your itinerary.`,
            }
          : request.status === "COMPLETED"
            ? {
                headline: "All done.",
                detail: `${title} is settled on your tab.`,
              }
            : {
                headline: "This one's closed.",
                detail: "Anything else you'd like arranged, the concierge is right there.",
              };

  return (
    <main className={styles.page}>
      <div className={`${styles.body} reveal reveal-1`}>
        <span className="eyebrow">{title}</span>
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
