"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addPaymentMethod,
  settleTab,
  type AddCardResult,
  type SettleResult,
} from "@/app/actions/payments";
import StripeCardForm from "@/components/payments/StripeCardForm";
import ConciergeLinks from "@/components/concierge/ConciergeLinks";
import { formatMoney } from "@/lib/money";
import styles from "./Wallet.module.css";

type Card = { brand: string; last4: string; expMonth: number; expYear: number };

/**
 * How the card on file resolves for THIS stay (src/lib/cardOnFile.ts), decided
 * on the server:
 *   stripe / mock → collect a card that way
 *   mismatch      → a card exists but was saved under the other provider; it
 *                   can't be charged, so the guest is asked to re-add
 *   unavailable   → payments can't be taken at all: NO form is shown. Falling
 *                   back to the demo's typed form here would invite a real
 *                   guest to type a real card into something that stores a
 *                   fake one.
 */
export type WalletMode = "stripe" | "mock" | "mismatch" | "unavailable";

const pad = (n: number) => String(n).padStart(2, "0");

export default function Wallet({
  card,
  pendingCents,
  currency,
  cardEditable = true,
  mode,
  concierge = null,
}: {
  card: Card | null;
  pendingCents: number;
  currency: string;
  /** False post-stay — the card-setup guard's UI mirror. Settle stays. */
  cardEditable?: boolean;
  mode: WalletMode;
  /** Contact + prebuilt message for the hand-off (ConciergeLinks owns the hrefs). */
  concierge?: { phone: string | null; email: string | null; message: string } | null;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [addState, addAction, adding] = useActionState<AddCardResult | null, FormData>(
    addPaymentMethod,
    null,
  );
  const [settleResult, setSettleResult] = useState<SettleResult | null>(null);
  const [settling, startSettle] = useTransition();
  // Saved, waiting on the refreshed card row — keeps the form from reopening in
  // the gap (and from minting a second SetupIntent).
  const [justSaved, setJustSaved] = useState(false);

  // Close the mock form once a card has been saved.
  useEffect(() => {
    if (addState?.ok) setShowForm(false);
  }, [addState]);

  // A mismatched card can't be charged, so it doesn't count as a card on file:
  // the guest is shown the collect form, not a reassuring row.
  const usableCard = mode === "mismatch" ? null : card;
  // Payments unavailable → the wallet goes READ-ONLY: the card on file is still
  // shown (it's a fact), but nothing that can't work is offered. A "Settle now"
  // that refuses, or a Replace that can't save, is a broken promise.
  const chargeable = mode !== "unavailable";
  const formOpen =
    cardEditable && chargeable && !justSaved && (showForm || !usableCard);

  const closeForm = () => setShowForm(false);
  const onSaved = () => {
    setJustSaved(true);
    closeForm();
    router.refresh();
  };

  return (
    <div className={styles.wrap}>
      {usableCard && !showForm && (
        <div className={styles.cardRow}>
          <div className={styles.cardInfo}>
            <span className={styles.cardGlyph} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                <path d="M2.5 9.5h19" />
              </svg>
            </span>
            <span>
              <span className={styles.cardBrand}>
                {usableCard.brand.toUpperCase()} ···· {usableCard.last4}
              </span>
              <span className={styles.cardExp}>
                Exp {pad(usableCard.expMonth)}/{String(usableCard.expYear).slice(-2)}
              </span>
            </span>
          </div>
          {cardEditable && chargeable && (
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                setJustSaved(false);
                setShowForm(true);
              }}
            >
              Replace
            </button>
          )}
        </div>
      )}

      {/* Payments can't be taken — a calm hand-off, never a form that can't work. */}
      {mode === "unavailable" && (
        <div className={styles.form}>
          <span className={styles.formTitle}>Your concierge has this</span>
          <p className={styles.stub}>
            We’ll set up your card with you directly — nothing to do here.
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
        </div>
      )}

      {formOpen && (
        <div className={styles.form}>
          <div className={styles.formHead}>
            <span className={styles.formTitle}>
              {mode === "mismatch"
                ? "Re-add your card"
                : usableCard
                  ? "Replace card"
                  : "Add a card on file"}
            </span>
            {usableCard && (
              <button type="button" className={styles.linkBtn} onClick={closeForm}>
                Cancel
              </button>
            )}
          </div>

          {mode === "mismatch" && (
            <p className={styles.stub}>
              Please re-add your card — the one on file can no longer be charged.
            </p>
          )}

          {mode === "mock" ? (
            // Demo / sandbox: a typed card, no real money. Kept as a plain form
            // action so it still works with JS off.
            <form action={addAction} className={styles.form}>
              <input
                name="number"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="Card number"
                className={styles.input}
              />
              <div className={styles.formRow}>
                <input
                  name="exp"
                  autoComplete="cc-exp"
                  placeholder="MM / YY"
                  className={styles.input}
                />
                <input
                  name="name"
                  autoComplete="cc-name"
                  placeholder="Name on card"
                  className={styles.input}
                />
              </div>
              {addState && !addState.ok && <p className={styles.err}>{addState.error}</p>}
              <button type="submit" disabled={adding} className={styles.addBtn}>
                {adding ? "Saving…" : "Save card"}
              </button>
              <p className={styles.stub}>Demo. No real card is stored or charged.</p>
            </form>
          ) : (
            <StripeCardForm
              classes={{
                form: styles.form,
                button: styles.addBtn,
                error: styles.err,
                note: styles.stub,
              }}
              note="Saved securely with Stripe. Nothing is charged until your booking locks."
              onSaved={onSaved}
            />
          )}
        </div>
      )}

      {usableCard && chargeable && !showForm && pendingCents > 0 && (
        <button
          type="button"
          disabled={settling}
          className={styles.settleBtn}
          onClick={() =>
            startSettle(async () => {
              const r = await settleTab();
              setSettleResult(r);
            })
          }
        >
          {settling ? "Settling…" : `Settle now · ${formatMoney(pendingCents, currency)}`}
        </button>
      )}

      {settleResult?.ok && (
        <p className={styles.settleNote}>
          Charged {formatMoney(settleResult.chargedCents, currency)} to your card. Thank you.
        </p>
      )}
      {settleResult && !settleResult.ok && <p className={styles.err}>{settleResult.error}</p>}
    </div>
  );
}
