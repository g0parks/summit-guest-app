"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { approveQuote, type ApproveResult } from "@/app/actions/requests";
import { formatMoney } from "@/lib/money";
import CardGate, { type CardGateState } from "@/components/payments/CardGate";
import ConciergeLinks from "@/components/concierge/ConciergeLinks";
import styles from "./ApproveQuote.module.css";

/**
 * The approval tap on a QUOTED request — one number, one decision, one button.
 * This tap IS the money moment (it creates the tab line), so it carries the card
 * gate: a card on file makes it one tap; no card collects one first; payments
 * unavailable hands off to the concierge rather than confirming uncarded.
 *
 * Renders its own confirmed close (the RequestWizard precedent): the action
 * skips revalidation so this panel isn't unmounted mid-result.
 */
export default function ApproveQuote({
  requestId,
  serviceName,
  amountCents,
  currency,
  cardGate,
  concierge = null,
}: {
  requestId: string;
  serviceName: string;
  amountCents: number;
  currency: string;
  cardGate: CardGateState;
  concierge?: { phone: string | null; email: string | null; message: string } | null;
}) {
  const [state, formAction, pending] = useActionState<ApproveResult | null, FormData>(
    approveQuote,
    null,
  );
  const [savedCard, setSavedCard] = useState<{ brand: string; last4: string } | null>(null);
  const amount = formatMoney(amountCents, currency);

  const gate: CardGateState = savedCard
    ? { state: "usable", brand: savedCard.brand, last4: savedCard.last4 }
    : cardGate;
  const cardOutstanding = gate.state !== "usable";
  const paymentsDown = gate.state === "unavailable";
  // The server may also refuse (payments went down between render and tap).
  const hatch = paymentsDown || (state && !state.ok && state.hatch === true);

  if (state?.ok) {
    return (
      <main className={styles.page}>
        <div className={`${styles.body} reveal reveal-1`}>
          <span className="eyebrow">{serviceName}</span>
          <h1 className={styles.headline}>Consider it done.</h1>
          <p className={styles.detail}>
            {serviceName} is confirmed. {amount} on your tab, and your
            concierge is already on it.
          </p>
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

  return (
    <main className={styles.page}>
      <div className={`${styles.body} reveal reveal-1`}>
        <span className="eyebrow">{serviceName}</span>
        {hatch ? (
          <>
            <h1 className={styles.headline}>We’ll finish this with your concierge.</h1>
            <p className={styles.detail}>
              {amount}, exactly as quoted — one text and they’ll take it from here.
            </p>
            {concierge && (
              <ConciergeLinks
                phone={concierge.phone}
                email={concierge.email}
                message={concierge.message}
                variant="card"
                smsLabel="Text your concierge"
                emailLabel="Email your concierge"
              />
            )}
          </>
        ) : (
          <>
            <h1 className={styles.headline}>Priced and ready.</h1>
            <p className={styles.detail}>
              Your concierge can have it arranged for {amount}, billed to your tab.
            </p>
            <CardGate gate={gate} concierge={concierge} onCardSaved={setSavedCard} />
            <form action={formAction} className={styles.form}>
              <input type="hidden" name="requestId" value={requestId} />
              {state && !state.ok && <p className={styles.error}>{state.error}</p>}
              <button
                type="submit"
                disabled={pending || cardOutstanding}
                className={styles.primaryBtn}
              >
                {pending ? "Confirming…" : `Approve ${amount}`}
              </button>
            </form>
          </>
        )}
        <div className={styles.links}>
          <Link href="/" className={styles.quietLink}>
            Back to your trip
          </Link>
        </div>
      </div>
    </main>
  );
}
