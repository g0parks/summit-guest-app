import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStay } from "@/lib/session";
import { getItineraryItemForChange } from "@/lib/queries";
import { changeWindows } from "@/lib/changePolicy";
import { changeMessage, getConciergeContact } from "@/lib/concierge";
import { dayKey, formatDayLabel, formatTime, tzAbbr } from "@/lib/dates";
import { getStayPhase } from "@/lib/stayPhase";
import ConciergeLinks from "@/components/concierge/ConciergeLinks";
import ChangeFlow from "@/components/changes/ChangeFlow";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

/**
 * The structured change page — the router for "something needs to move".
 * In-window (per-service cutoffs, src/lib/changePolicy.ts) the guest gets
 * structured taps: Move / Cancel / Something else. Past the cutoff, a null
 * cutoff, or an unlinked item → ONLY the quiet concierge escape hatch —
 * that's doctrine (changes that close-in are handled personally), not a
 * fallback bug.
 */
export default async function ChangeItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const { stay } = await requireStay();
  const item = await getItineraryItemForChange(stay.id, itemId);
  if (!item) notFound();

  const tz = stay.property.timezone;
  const whenLabel = item.allDay
    ? formatDayLabel(item.startsAt, tz)
    : `${formatDayLabel(item.startsAt, tz)} · ${formatTime(item.startsAt, tz)}`;
  const concierge = getConciergeContact();

  // ── Post-stay: the line never closes, but the itinerary is history ──
  if (getStayPhase(stay, tz) === "POST_STAY") {
    return (
      <StatusScreen
        eyebrow={item.title}
        headline="Your stay has wrapped."
        detail="We'd love to arrange the next one. The line never closes."
      />
    );
  }

  // ── Already in motion: the chip says it; this page agrees ──
  if (item.changePending || item.changeRequests.length > 0) {
    return (
      <StatusScreen
        eyebrow={item.title}
        headline="Being rearranged."
        detail="Your concierge has it. The itinerary will update once it's set."
      />
    );
  }

  const { canMove, canCancel } = changeWindows(item.serviceRequest?.service, item.startsAt, {
    requestStatus: item.serviceRequest?.status,
  });

  // ── No in-app window: the quiet escape hatch, by doctrine ──
  if (!canMove && !canCancel) {
    return (
      <main className={styles.page}>
        <div className={`${styles.body} reveal reveal-1`}>
          <span className="eyebrow">{item.title}</span>
          <h1 className={styles.headline}>We&rsquo;ll handle this one personally.</h1>
          <p className={styles.detail}>
            Changes to {item.title} ({whenLabel}) are best handled directly. One
            message and it&rsquo;s done.
          </p>
          {(concierge.phone || concierge.email) && (
            <div className={styles.conciergeWrap}>
              <ConciergeLinks
                phone={concierge.phone}
                email={concierge.email}
                message={changeMessage({
                  guestFirstName: stay.guest.firstName,
                  propertyName: stay.property.name,
                  itemTitle: item.title,
                  whenLabel,
                })}
                variant="card"
                smsLabel="Text your concierge"
                emailLabel="Email your concierge"
              />
            </div>
          )}
          <div className={styles.links}>
            <Link href="/itinerary" className={styles.quietLink}>
              Back to your itinerary
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <ChangeFlow
      itemId={item.id}
      itemTitle={item.title}
      whenLabel={whenLabel}
      canMove={canMove}
      canCancel={canCancel}
      defaultDate={dayKey(item.startsAt, tz)}
      tzHint={tzAbbr(item.startsAt, tz)}
    />
  );
}

function StatusScreen({
  eyebrow,
  headline,
  detail,
}: {
  eyebrow: string;
  headline: string;
  detail: string;
}) {
  return (
    <main className={styles.page}>
      <div className={`${styles.body} reveal reveal-1`}>
        <span className="eyebrow">{eyebrow}</span>
        <h1 className={styles.headline}>{headline}</h1>
        <p className={styles.detail}>{detail}</p>
        <div className={styles.links}>
          <Link href="/itinerary" className={styles.quietLink}>
            Back to your itinerary
          </Link>
          <Link href="/" className={styles.quietLink}>
            Back to your trip
          </Link>
        </div>
      </div>
    </main>
  );
}
