import Link from "next/link";
import { requireStay } from "@/lib/session";
import { getStayPhase } from "@/lib/stayPhase";
import { dayKey } from "@/lib/dates";
import RequestBox from "@/components/requests/RequestBox";
import styles from "@/components/requests/RequestWizard.module.css";

export const dynamic = "force-dynamic";

/**
 * The request box surface — in-app capture for anything off the catalog. The
 * line stays open once the stay wraps (we'd love the next trip), but there's
 * nothing to arrange for a finished stay, so it shows the warm close instead
 * of the form.
 */
export default async function AskPage() {
  const { stay } = await requireStay();
  const postStay = getStayPhase(stay, stay.property.timezone) === "POST_STAY";

  if (postStay) {
    return (
      <main className={styles.page}>
        <div className={`${styles.screen} ${styles.active}`}>
          <div className={styles.doneBody}>
            <span className="eyebrow">The concierge</span>
            <h1 className={styles.headline}>Your stay has wrapped.</h1>
            <p className={styles.detail}>
              We&rsquo;d love to arrange it for your next one. The line never closes.
            </p>
            <div className={styles.doneLinks}>
              <Link href="/" className={styles.quietLink}>
                Back to your trip
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return <RequestBox minDate={dayKey(new Date(), stay.property.timezone)} />;
}
