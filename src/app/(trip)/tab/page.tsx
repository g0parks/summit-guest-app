import { requireStay } from "@/lib/session";
import { getTab } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { formatDayLabel } from "@/lib/dates";
import { generalMessage, getConciergeContact } from "@/lib/concierge";
import ConciergeLinks from "@/components/concierge/ConciergeLinks";
import Wallet from "@/components/tab/Wallet";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function TabPage() {
  const { stay } = await requireStay();
  const tz = stay.property.timezone;
  const { items, defaultCard, pending, charged, total } = await getTab(stay.id);
  const concierge = getConciergeContact();

  return (
    <main className={styles.page}>
      <header className={`${styles.head} reveal reveal-1`}>
        <span className="eyebrow">Your tab</span>
        <p className={`${styles.total} tabular`}>{formatMoney(total, stay.currency)}</p>
        <p className={styles.totalSub}>
          {pending > 0 ? (
            <>
              {formatMoney(pending, stay.currency)} pending ·{" "}
              {formatMoney(charged, stay.currency)} settled
            </>
          ) : (
            <>All settled — thank you.</>
          )}
        </p>
      </header>

      <section className={`${styles.walletWrap} reveal reveal-2`}>
        <Wallet
          card={
            defaultCard
              ? {
                  brand: defaultCard.brand,
                  last4: defaultCard.last4,
                  expMonth: defaultCard.expMonth,
                  expYear: defaultCard.expYear,
                }
              : null
          }
          pendingCents={pending}
          currency={stay.currency}
        />
      </section>

      <section className={`${styles.items} reveal reveal-3`}>
        {items.length === 0 ? (
          <p className={styles.empty}>Nothing on your tab yet.</p>
        ) : (
          <ul className={styles.list}>
            {items.map((it) => (
              <li key={it.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowDesc}>{it.description}</span>
                  <span className={styles.rowDate}>{formatDayLabel(it.occurredAt, tz)}</span>
                </div>
                <div className={styles.rowRight}>
                  <span className={`${styles.rowAmount} tabular`}>
                    {formatMoney(it.amount, it.currency)}
                  </span>
                  <span className={it.status === "CHARGED" ? styles.settled : styles.pendingPill}>
                    {it.status === "CHARGED" ? "Settled" : "Pending"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className={`${styles.reassure} reveal reveal-4`}>
        Everything you request lands here — no checkout, no wallet. Settle anytime,
        or we’ll quietly close it out at departure.
      </p>

      {(concierge.phone || concierge.email) && (
        <p className={`${styles.conciergeAsk} reveal reveal-4`}>
          A question about a charge?{" "}
          <ConciergeLinks
            phone={concierge.phone}
            email={concierge.email}
            message={generalMessage({
              guestFirstName: stay.guest.firstName,
              propertyName: stay.property.name,
            })}
            variant="inline"
            smsLabel="Text your concierge"
            emailLabel="Email your concierge"
          />
        </p>
      )}
    </main>
  );
}
