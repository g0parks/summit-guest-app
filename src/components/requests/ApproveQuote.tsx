"use client";

import { useActionState } from "react";
import Link from "next/link";
import { approveQuote, type ApproveResult } from "@/app/actions/requests";
import { formatMoney } from "@/lib/money";
import styles from "./ApproveQuote.module.css";

/**
 * The approval tap on a QUOTED request — one number, one decision, one
 * button (the future card-consent moment). Renders its own confirmed close
 * (the RequestWizard precedent): the action skips revalidation so this
 * panel isn't unmounted mid-result, and navigation renders fresh.
 */
export default function ApproveQuote({
  requestId,
  serviceName,
  amountCents,
  currency,
}: {
  requestId: string;
  serviceName: string;
  amountCents: number;
  currency: string;
}) {
  const [state, formAction, pending] = useActionState<ApproveResult | null, FormData>(
    approveQuote,
    null,
  );
  const amount = formatMoney(amountCents, currency);

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
        <h1 className={styles.headline}>Priced and ready.</h1>
        <p className={styles.detail}>
          Your concierge can have it arranged for {amount}, billed to your tab.
        </p>
        <form action={formAction} className={styles.form}>
          <input type="hidden" name="requestId" value={requestId} />
          {state && !state.ok && <p className={styles.error}>{state.error}</p>}
          <button type="submit" disabled={pending} className={styles.primaryBtn}>
            {pending ? "Confirming…" : `Approve ${amount}`}
          </button>
        </form>
        <div className={styles.links}>
          <Link href="/" className={styles.quietLink}>
            Back to your trip
          </Link>
        </div>
      </div>
    </main>
  );
}
