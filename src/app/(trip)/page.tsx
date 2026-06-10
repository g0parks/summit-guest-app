import Link from "next/link";
import { requireStay } from "@/lib/session";
import { resolveBrand } from "@/lib/branding";
import { getTripHome } from "@/lib/queries";
import { formatDateRange, formatTime, relativeDayWord } from "@/lib/dates";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function TripHome() {
  const { stay } = await requireStay();
  const { guest, property } = stay;
  const tz = property.timezone;
  const brand = resolveBrand(property);
  const { nextUp, unclaimedPerk } = await getTripHome(stay.id, property.partnerId);

  return (
    <main className={styles.page}>
      <header className={`${styles.topbar} reveal reveal-1`}>
        {brand.poweredBy ? (
          <div className={styles.lockup}>
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.label} className={styles.brandLogo} />
            ) : (
              <span className={styles.brandLabel}>{brand.label}</span>
            )}
            <span className={styles.poweredBy}>powered by Summit</span>
          </div>
        ) : (
          <span className={styles.wordmark}>SUMMIT</span>
        )}
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

      {unclaimedPerk && (
        <Link href="/perks" className={`${styles.gift} reveal reveal-3`}>
          <div className={styles.giftBody}>
            <span className="eyebrow">
              {brand.poweredBy
                ? `A gift from ${brand.shortName}`
                : "With our compliments"}
            </span>
            <h2 className={styles.giftTitle}>{unclaimedPerk.name}</h2>
            <p className={styles.giftMeta}>Complimentary — tap to claim</p>
          </div>
          <svg className={styles.giftChevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      )}

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

      {/* tab lives on the tab page — the home CTA stays above the fold */}
      <div className={`${styles.actions} reveal reveal-4`}>
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
