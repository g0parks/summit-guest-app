"use client";

import { useState, useTransition } from "react";
import { addPaymentMethod } from "@/app/actions/payments";
import ConciergeLinks from "@/components/concierge/ConciergeLinks";
import StripeCardForm, { type SavedCardSummary } from "./StripeCardForm";
import styles from "./CardGate.module.css";

/**
 * The card gate — the one shared piece behind every money-committing tap
 * (fixed-price wizard confirm · grocery order · quote approval).
 *
 * Three states, one calm screen each:
 *   card on file  → a quiet line; the host's own button is the only action
 *   no card       → collect one (Stripe Element, or the demo's typed form)
 *   unavailable   → the quiet concierge hand-off; the host must not confirm
 *
 * It never renders its own "confirm" button: the host owns the commitment tap,
 * so the guest sees one primary action, not two.
 */

export type CardGateState =
  | { state: "usable"; brand: string; last4: string }
  | { state: "none"; type: "MOCK" | "STRIPE" }
  | { state: "mismatch"; type: "MOCK" | "STRIPE" }
  | { state: "unavailable" };

export default function CardGate({
  gate,
  onCardSaved,
  concierge = null,
}: {
  gate: CardGateState;
  /** Called once a card is on file — the host re-enables its primary action. */
  onCardSaved: (card: SavedCardSummary) => void;
  /** Contact + prebuilt message for the unavailable hand-off. */
  concierge?: { phone: string | null; email: string | null; message: string } | null;
}) {
  const [mockError, setMockError] = useState<string | null>(null);
  const [mockCard, setMockCard] = useState({ number: "", exp: "", name: "" });
  const [savingMock, startMockSave] = useTransition();

  if (gate.state === "usable") {
    return (
      <div className={styles.wrap}>
        <p className={styles.onFile}>
          <span className={styles.brand}>
            {gate.brand.toUpperCase()} ···· {gate.last4}
          </span>
          <span className={styles.reassure}>
            You won’t be charged until your booking locks.
          </span>
        </p>
      </div>
    );
  }

  if (gate.state === "unavailable") {
    return (
      <div className={styles.wrap}>
        <p className={styles.headline}>We’ll finish this with your concierge.</p>
        <p className={styles.reassure}>
          Everything you’ve told us is saved. One text and they’ll set it up from here.
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
    );
  }

  const reAdd = gate.state === "mismatch";

  // Demo sandboxes run on the mock provider: the typed form, plainly labelled,
  // never a real card. Called imperatively because this sits inside a host form.
  if (gate.type === "MOCK") {
    return (
      <div className={styles.wrap}>
        <p className={styles.headline}>
          {reAdd ? "Re-add your card" : "Confirm with a card"}
        </p>
        <div className={styles.form}>
          <input
            value={mockCard.number}
            onChange={(e) => setMockCard({ ...mockCard, number: e.target.value })}
            inputMode="numeric"
            placeholder="Card number"
            className={styles.input}
          />
          <div className={styles.row}>
            <input
              value={mockCard.exp}
              onChange={(e) => setMockCard({ ...mockCard, exp: e.target.value })}
              placeholder="MM / YY"
              className={styles.input}
            />
            <input
              value={mockCard.name}
              onChange={(e) => setMockCard({ ...mockCard, name: e.target.value })}
              placeholder="Name on card"
              className={styles.input}
            />
          </div>
          {mockError && <p className={styles.error}>{mockError}</p>}
          <button
            type="button"
            disabled={savingMock}
            className={styles.saveBtn}
            onClick={() =>
              startMockSave(async () => {
                const fd = new FormData();
                fd.set("number", mockCard.number);
                fd.set("exp", mockCard.exp);
                fd.set("name", mockCard.name);
                const res = await addPaymentMethod(null, fd);
                if (!res.ok) {
                  setMockError(res.error);
                  return;
                }
                setMockError(null);
                onCardSaved({ brand: res.brand, last4: res.last4 });
              })
            }
          >
            {savingMock ? "Saving…" : "Save card"}
          </button>
          <p className={styles.note}>Demo. No real card is stored or charged.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.headline}>
        {reAdd ? "Re-add your card" : "Confirm with a card"}
      </p>
      <p className={styles.reassure}>
        {reAdd
          ? "The card on file can no longer be charged — add it again and you’re set."
          : "You won’t be charged until your booking locks."}
      </p>
      <StripeCardForm
        classes={{
          form: styles.form,
          button: styles.saveBtn,
          error: styles.error,
          note: styles.note,
        }}
        saveLabel="Save card"
        note="Saved securely with Stripe."
        onSaved={onCardSaved}
      />
    </div>
  );
}
