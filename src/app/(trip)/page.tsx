import Link from "next/link";
import { requireStay } from "@/lib/session";
import { getTripHome } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { formatDateRange, formatTime, relativeDayWord } from "@/lib/dates";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function TripHome() {
  const { stay } = await requireStay();
  const { guest, property } = stay;
  const tz = property.timezone;
  const { nextUp, tabTotalCents } = await getTripHome(stay.id);

  return (
    <main className={styles.page}>
      <header className={`${styles.topbar} reveal reveal-1`}>
        <span className={styles.wordmark}>SUMMIT</span>
      </header>

      <section className={`${styles.welcome} reveal reveal-2`}>
        <h1 className={styles.greeting}>
          Welcome back,
          <br />
          <span className={styles.name}>{guest.firstName}.</span>
        </h1>
        <p className={styles.property}>{property.name}</p>
        <p className={styles.trip}>
          {formatDateRange(stay.arrivalDate, stay.departureDate, tz)}
          {stay.partySize ? ` · ${stay.partySize} guests` : ""}
        </p>
      </section>

      <section className={`${styles.card} reveal reveal-3`}>
        <span className="eyebrow">Next up</span>
        {nextUp ? (
          <>
            <h2 className={styles.cardTitle}>{nextUp.title}</h2>
            <p className={styles.cardMeta}>
              <span className={styles.when}>{relativeDayWord(nextUp.startsAt, tz)}</span>
              {!nextUp.allDay && (
                <>
                  <span className={styles.dot} aria-hidden="true">
                    ·
                  </span>
                  {formatTime(nextUp.startsAt, tz)}
                </>
              )}
              {nextUp.location && (
                <>
                  <span className={styles.dot} aria-hidden="true">
                    ·
                  </span>
                  {nextUp.location}
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <h2 className={styles.cardTitle}>Nothing scheduled</h2>
            <p className={styles.cardMeta}>
              Your time is yours — explore the concierge whenever you like.
            </p>
          </>
        )}
      </section>

      <section className={`${styles.tab} reveal reveal-4`}>
        <div>
          <span className="eyebrow">Your tab</span>
          <p className={`${styles.tabAmount} tabular`}>
            {formatMoney(tabTotalCents, stay.currency)}
          </p>
        </div>
        <Link href="/tab" className={styles.tabLink}>
          View
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </section>

      <div className={`${styles.actions} reveal reveal-5`}>
        <Link href="/services" className={styles.cta}>
          Explore concierge
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
        <Link href="/itinerary" className={styles.secondary}>
          View today&rsquo;s itinerary
        </Link>
      </div>
    </main>
  );
}
