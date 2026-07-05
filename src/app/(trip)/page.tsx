import Link from "next/link";
import { requireStay, type ActiveStay } from "@/lib/session";
import { resolveBrand, type Brand } from "@/lib/branding";
import { getOpenRequests, getTab, getTripHome } from "@/lib/queries";
import { getConciergeContact, generalMessage } from "@/lib/concierge";
import { getStayPhase, daysUntilArrival } from "@/lib/stayPhase";
import ConciergeLinks from "@/components/concierge/ConciergeLinks";
import NextTripForm from "@/components/trip/NextTripForm";
import RentalCarPrompt from "@/components/trip/RentalCarPrompt";
import TextUpdatesPrompt from "@/components/trip/TextUpdatesPrompt";
import { formatDateRange, formatTime, relativeDayWord } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

/** Cross-attach sources — a sibling Summit started for the guest, not homework
 *  they opened. Labeled as "we're on it" so the spawned item never surprises. */
const ATTACH_SOURCES = new Set(["grocery-upsell", "grocery-attach", "chef-attach"]);

/** Checklist state line for an open request — shared by both home phases. */
function requestChecklistLabel(
  req: { status: string; quotedAmount: number | null; source: string },
  currency: string,
): string {
  if (req.status === "SIGNALED") {
    return ATTACH_SOURCES.has(req.source)
      ? "We've started this for you"
      : "A few details and it's done";
  }
  if (req.status === "QUOTED" && req.quotedAmount) {
    return `Approve ${formatMoney(req.quotedAmount, currency)}`;
  }
  return "Your concierge has this";
}

/**
 * The trip home, phase-aware (src/lib/stayPhase.ts):
 *  PRE_ARRIVAL — the countdown + plan-ahead funnel (requests stay open).
 *  IN_STAY     — the original page, untouched.
 *  POST_STAY   — the quiet recap; one CTA ("Have us along next time") and
 *                the concierge line, which never closes.
 */
export default async function TripHome() {
  const active = await requireStay();
  const { stay } = active;
  const brand = resolveBrand(stay.property);
  const phase = getStayPhase(stay, stay.property.timezone);

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

      {phase === "PRE_ARRIVAL" ? (
        <PreArrivalBody active={active} brand={brand} />
      ) : phase === "POST_STAY" ? (
        <PostStayBody active={active} brand={brand} />
      ) : (
        <InStayBody active={active} brand={brand} />
      )}
    </main>
  );
}

/* ── PRE_ARRIVAL ─────────────────────────────────────────────────────── */

async function PreArrivalBody({ active, brand }: { active: ActiveStay; brand: Brand }) {
  const { stay } = active;
  const { guest, property } = stay;
  const tz = property.timezone;
  const [{ unclaimedPerk }, openRequests] = await Promise.all([
    getTripHome(stay.id, property.partnerId),
    getOpenRequests(stay.id),
  ]);
  const concierge = getConciergeContact();

  const days = daysUntilArrival(stay, tz);
  const countdown =
    days <= 0
      ? `Arriving today, ${property.name}`
      : days === 1
        ? `Tomorrow, ${property.name}`
        : `${days} days until ${property.name}`;

  return (
    <>
      <section className={`${styles.welcome} reveal reveal-2`}>
        <h1 className={styles.greeting}>
          Welcome,
          <br />
          <span className={styles.name}>{guest.firstName}.</span>
        </h1>
        <p className={styles.property}>{countdown}</p>
        <p className={styles.trip}>
          {formatDateRange(stay.arrivalDate, stay.departureDate, tz)}
          {stay.partySize ? ` · ${stay.partySize} guests` : ""}
        </p>
        <p className={styles.trustLine}>
          {brand.poweredBy
            ? `${brand.shortName} partnered with Summit to look after your stay. You ask, we arrange. It all lands on one bill.`
            : "Summit looks after your stay. You ask, we arrange. It all lands on one bill."}
        </p>
      </section>

      {/* the pre-arrival gift hook — by design, unchanged across phases */}
      {unclaimedPerk && (
        <Link href="/perks" className={`${styles.gift} reveal reveal-3`}>
          <div className={styles.giftBody}>
            <span className="eyebrow">
              {brand.poweredBy
                ? `A gift from ${brand.shortName}`
                : "With our compliments"}
            </span>
            <h2 className={styles.giftTitle}>{unclaimedPerk.name}</h2>
            <p className={styles.giftMeta}>With our compliments. Tap to claim.</p>
          </div>
          <svg className={styles.giftChevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      )}

      {/* the resumption surface — every open signal, one tap from done */}
      <section className={`${styles.card} reveal reveal-3`}>
        <span className="eyebrow">Before you arrive</span>
        {openRequests.length > 0 ? (
          <ul className={styles.checklist}>
            {openRequests.map((req) => {
              const label = requestChecklistLabel(req, stay.currency);
              return (
                <li key={req.id}>
                  <Link href={`/requests/${req.id}`} className={styles.checkRow}>
                    <span className={styles.checkBody}>
                      <span className={styles.checkName}>
                        {req.service?.name ?? req.customTitle ?? "Your request"}
                      </span>
                      <span className={styles.checkState}>{label}</span>
                    </span>
                    <svg className={styles.checkChevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.cardSolo}>
            A little planning now, and your arrival takes care of itself.
          </p>
        )}
      </section>

      {/* ONE quiet card at a time — a calm home, not a checklist. The stay
          parameter (rental car) goes first; the text opt-in takes the slot
          once that's answered. The opt-in card retires the moment they opt
          in and never re-begs after a withdrawal (TCPA: no text without
          this yes). */}
      {stay.hasRentalCar == null ? (
        <RentalCarPrompt />
      ) : (
        stay.guest.smsConsentAt == null &&
        stay.guest.smsOptOutAt == null && (
          <TextUpdatesPrompt defaultPhone={stay.guest.phone ?? ""} />
        )
      )}

      <div className={`${styles.actions} reveal reveal-4`}>
        <Link href="/plan" className={styles.cta}>
          Plan ahead
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
        <Link href="/services" className={styles.secondary}>
          Browse the concierge
        </Link>
      </div>

      {/* The request box — quiet, below the primary action: the long tail the
          menu can't hold (the in-app door, not the config-gated text line). */}
      <p className={`${styles.askLine} reveal reveal-4`}>
        <Link href="/ask" className={styles.interestLink}>
          Something else? Ask the concierge &rarr;
        </Link>
      </p>

      {(concierge.phone || concierge.email) && (
        <section className={`${styles.card} reveal reveal-5`}>
          <span className="eyebrow">Your concierge</span>
          <p className={styles.conciergeCopy}>
            Dinner moved, powder-day plans, a question.{" "}
            {concierge.phone ? "Text us" : "Email us"} and consider it handled.
          </p>
          <ConciergeLinks
            phone={concierge.phone}
            email={concierge.email}
            message={generalMessage({
              guestFirstName: guest.firstName,
              propertyName: property.name,
            })}
            variant="card"
            smsLabel="Text your concierge"
            emailLabel="Email your concierge"
          />
        </section>
      )}
    </>
  );
}

/* ── IN_STAY — the original page, untouched ──────────────────────────── */

async function InStayBody({ active, brand }: { active: ActiveStay; brand: Brand }) {
  const { stay } = active;
  const { guest, property } = stay;
  const tz = property.timezone;
  const [{ nextUp, unclaimedPerk }, openRequests] = await Promise.all([
    getTripHome(stay.id, property.partnerId),
    getOpenRequests(stay.id),
  ]);
  const concierge = getConciergeContact();

  return (
    <>
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
        <p className={styles.trustLine}>
          {brand.poweredBy
            ? `${brand.shortName} partnered with Summit to look after your stay. You ask, we arrange. It all lands on one bill.`
            : "Summit looks after your stay. You ask, we arrange. It all lands on one bill."}
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
            <p className={styles.giftMeta}>With our compliments. Tap to claim.</p>
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
            {/* the structured change door, quiet (Channel Doctrine) */}
            {!nextUp.changePending && (
              <p className={styles.cardMeta}>
                <Link
                  href={`/itinerary/${nextUp.id}/change`}
                  className={styles.interestLink}
                >
                  Request a change
                </Link>
              </p>
            )}
          </>
        ) : (
          <>
            <h2 className={styles.cardTitle}>Nothing scheduled</h2>
            <p className={styles.cardMeta}>
              Your time is yours. Explore the concierge whenever you like.
            </p>
          </>
        )}
      </section>

      {/* requests in motion — so a same-day ask the guest just sent shows up
          where the close screen promised ("on your trip page") */}
      {openRequests.length > 0 && (
        <section className={`${styles.card} reveal reveal-3`}>
          <span className="eyebrow">In motion</span>
          <ul className={styles.checklist}>
            {openRequests.map((req) => {
              const label = requestChecklistLabel(req, stay.currency);
              return (
                <li key={req.id}>
                  <Link href={`/requests/${req.id}`} className={styles.checkRow}>
                    <span className={styles.checkBody}>
                      <span className={styles.checkName}>
                        {req.service?.name ?? req.customTitle ?? "Your request"}
                      </span>
                      <span className={styles.checkState}>{label}</span>
                    </span>
                    <svg className={styles.checkChevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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

      {/* The request box — quiet in-app door for anything off the menu. */}
      <p className={`${styles.askLine} reveal reveal-4`}>
        <Link href="/ask" className={styles.interestLink}>
          Something else? Ask the concierge &rarr;
        </Link>
      </p>

      {/* the Concierge Line — the thread is the interface, this is the door */}
      {(concierge.phone || concierge.email) && (
        <section className={`${styles.card} reveal reveal-5`}>
          <span className="eyebrow">Your concierge</span>
          <p className={styles.conciergeCopy}>
            Dinner moved, powder-day plans, a question.{" "}
            {concierge.phone ? "Text us" : "Email us"} and consider it handled.
          </p>
          <ConciergeLinks
            phone={concierge.phone}
            email={concierge.email}
            message={generalMessage({
              guestFirstName: guest.firstName,
              propertyName: property.name,
            })}
            variant="card"
            smsLabel="Text your concierge"
            emailLabel="Email your concierge"
          />
        </section>
      )}
    </>
  );
}

/* ── POST_STAY — the quiet recap; the line never closes ──────────────── */

async function PostStayBody({ active, brand }: { active: ActiveStay; brand: Brand }) {
  const { stay } = active;
  const { guest, property } = stay;
  const tz = property.timezone;
  const tab = await getTab(stay.id);
  const concierge = getConciergeContact();

  return (
    <>
      <section className={`${styles.welcome} reveal reveal-2`}>
        <h1 className={styles.greeting}>
          Thank you,
          <br />
          <span className={styles.name}>{guest.firstName}.</span>
        </h1>
        <p className={styles.property}>{property.name}</p>
        <p className={styles.trip}>
          Your stay · {formatDateRange(stay.arrivalDate, stay.departureDate, tz)}
        </p>
        <p className={styles.thanks}>
          It was a pleasure looking after you, from all of us at{" "}
          {brand.shortName}.
        </p>
      </section>

      {tab.items.length > 0 && (
        <section className={`${styles.card} reveal reveal-3`}>
          <span className="eyebrow">Your tab</span>
          <h2 className={styles.cardTitle}>
            {formatMoney(tab.charged, stay.currency)} settled
          </h2>
          {tab.pending > 0 ? (
            <p className={styles.cardMeta}>
              <Link href="/tab" className={styles.interestLink}>
                {formatMoney(tab.pending, stay.currency)} being closed out
              </Link>
            </p>
          ) : (
            <p className={styles.cardMeta}>
              Every detail settled. Nothing left to do.
            </p>
          )}
        </section>
      )}

      <div className={`${styles.actions} reveal reveal-4`}>
        <NextTripForm />
      </div>

      {(concierge.phone || concierge.email) && (
        <section className={`${styles.card} reveal reveal-5`}>
          <span className="eyebrow">Your concierge</span>
          <p className={styles.conciergeCopy}>
            The line never closes. A question about your tab, something left
            behind, the next trip.{" "}
            {concierge.phone ? "Text us" : "Email us"} and consider it handled.
          </p>
          <ConciergeLinks
            phone={concierge.phone}
            email={concierge.email}
            message={generalMessage({
              guestFirstName: guest.firstName,
              propertyName: property.name,
            })}
            variant="card"
            smsLabel="Text your concierge"
            emailLabel="Email your concierge"
          />
        </section>
      )}
    </>
  );
}
