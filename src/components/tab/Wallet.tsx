"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  addPaymentMethod,
  settleTab,
  type AddCardResult,
  type SettleResult,
} from "@/app/actions/payments";
import { formatMoney } from "@/lib/money";
import styles from "./Wallet.module.css";

type Card = { brand: string; last4: string; expMonth: number; expYear: number };

const pad = (n: number) => String(n).padStart(2, "0");

export default function Wallet({
  card,
  pendingCents,
  currency,
  cardEditable = true,
}: {
  card: Card | null;
  pendingCents: number;
  currency: string;
  /** False post-stay — the addPaymentMethod guard's UI mirror. Settle stays. */
  cardEditable?: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [addState, addAction, adding] = useActionState<AddCardResult | null, FormData>(
    addPaymentMethod,
    null,
  );
  const [settleResult, setSettleResult] = useState<SettleResult | null>(null);
  const [settling, startSettle] = useTransition();

  // Close the form once a card has been saved.
  useEffect(() => {
    if (addState?.ok) setShowForm(false);
  }, [addState]);

  const formOpen = cardEditable && (!card || showForm);

  return (
    <div className={styles.wrap}>
      {card && !showForm && (
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
                {card.brand.toUpperCase()} ···· {card.last4}
              </span>
              <span className={styles.cardExp}>
                Exp {pad(card.expMonth)}/{String(card.expYear).slice(-2)}
              </span>
            </span>
          </div>
          {cardEditable && (
            <button type="button" className={styles.linkBtn} onClick={() => setShowForm(true)}>
              Replace
            </button>
          )}
        </div>
      )}

      {formOpen && (
        <form action={addAction} className={styles.form}>
          <div className={styles.formHead}>
            <span className={styles.formTitle}>{card ? "Replace card" : "Add a card on file"}</span>
            {card && (
              <button type="button" className={styles.linkBtn} onClick={() => setShowForm(false)}>
                Cancel
              </button>
            )}
          </div>
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
          <p className={styles.stub}>Demo — no real card is stored or charged.</p>
        </form>
      )}

      {card && !showForm && pendingCents > 0 && (
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
          Charged {formatMoney(settleResult.chargedCents, currency)} to your card — thank you.
        </p>
      )}
      {settleResult && !settleResult.ok && <p className={styles.err}>{settleResult.error}</p>}
    </div>
  );
}
