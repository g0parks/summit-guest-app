"use client";

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Appearance, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import {
  addPaymentMethod,
  beginCardSetup,
  completeCardSetup,
  settleTab,
  type AddCardResult,
  type SettleResult,
} from "@/app/actions/payments";
import type { ProviderType } from "@/lib/payments/types";
import { formatMoney } from "@/lib/money";
import styles from "./Wallet.module.css";

type Card = { brand: string; last4: string; expMonth: number; expYear: number };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Stripe.js is loaded once per page, lazily — the module-scope promise is
 * Stripe's own requirement (re-loading it on every render remounts the iframe).
 */
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = pk ? loadStripe(pk) : Promise.resolve(null);
  }
  return stripePromise;
}

/**
 * Dress the Payment Element in the page's own tokens, so a co-branded stay's
 * card form carries the PARTNER's accent instead of Stripe blue (co-brand
 * doctrine: Summit stays quiet, the brand on screen is theirs).
 */
function elementsAppearance(): Appearance {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  return {
    theme: "stripe",
    variables: {
      colorPrimary: v("--accent", "#2f4b3c"),
      colorText: v("--ink", "#211f1b"),
      colorTextSecondary: v("--ink-muted", "#6b655c"),
      colorTextPlaceholder: v("--ink-faint", "#9a9387"),
      colorBackground: v("--bg", "#f7f3ec"),
      borderRadius: v("--radius-md", "14px"),
      fontSizeBase: "16px",
      spacingUnit: "4px",
    },
  };
}

/**
 * The real card form. The number goes browser → Stripe; this app only ever
 * sees the SetupIntent id it hands back (PCI SAQ-A).
 */
function StripeCardForm({ onSaved }: { onSaved: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements || saving) return;
        setSaving(true);
        setError(null);

        const confirmed = await stripe.confirmSetup({
          elements,
          redirect: "if_required",
        });
        if (confirmed.error || !confirmed.setupIntent) {
          setError(confirmed.error?.message ?? "That card didn't save — please try again.");
          setSaving(false);
          return;
        }

        const res = await completeCardSetup(confirmed.setupIntent.id);
        if (!res.ok) {
          setError(res.error);
          setSaving(false);
          return;
        }
        setSaving(false);
        onSaved();
      }}
    >
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className={styles.err}>{error}</p>}
      <button type="submit" disabled={saving} className={styles.addBtn}>
        {saving ? "Saving…" : "Save card"}
      </button>
      <p className={styles.stub}>
        Saved securely with Stripe. Nothing is charged until your booking locks.
      </p>
    </form>
  );
}

export default function Wallet({
  card,
  pendingCents,
  currency,
  cardEditable = true,
  providerType,
}: {
  card: Card | null;
  pendingCents: number;
  currency: string;
  /** False post-stay — the card-setup guard's UI mirror. Settle stays. */
  cardEditable?: boolean;
  /** Resolved per stay on the server: demo sandboxes are always MOCK. */
  providerType: ProviderType;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [addState, addAction, adding] = useActionState<AddCardResult | null, FormData>(
    addPaymentMethod,
    null,
  );
  const [settleResult, setSettleResult] = useState<SettleResult | null>(null);
  const [settling, startSettle] = useTransition();

  // Stripe path: one SetupIntent per opened form.
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [, startSetup] = useTransition();
  const requestedRef = useRef(false);
  // Saved, waiting on the refreshed card row — keeps the form from reopening
  // (and minting a second SetupIntent) in the gap.
  const [justSaved, setJustSaved] = useState(false);

  // Close the mock form once a card has been saved.
  useEffect(() => {
    if (addState?.ok) setShowForm(false);
  }, [addState]);

  const isStripe = providerType === "STRIPE";
  const formOpen = cardEditable && !justSaved && (showForm || !card);

  /**
   * Mint the SetupIntent when the form opens — and only then: an untouched /tab
   * visit shouldn't create Stripe objects. The ref (not the error/secret state)
   * is the guard, so a failed setup shows its message instead of retrying in a
   * loop.
   */
  const startCardSetup = useCallback(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    setSetupError(null);
    setAppearance(elementsAppearance());
    startSetup(async () => {
      const res = await beginCardSetup();
      if (!res.ok) {
        setSetupError(res.error);
        return;
      }
      if (res.setup.mode === "element") setClientSecret(res.setup.clientSecret);
    });
  }, []);

  useEffect(() => {
    if (isStripe && formOpen) startCardSetup();
  }, [isStripe, formOpen, startCardSetup]);

  const closeForm = () => {
    setShowForm(false);
    setClientSecret(null);
    setSetupError(null);
    requestedRef.current = false;
  };

  const retrySetup = () => {
    requestedRef.current = false;
    setSetupError(null);
    startCardSetup();
  };

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

      {formOpen && (
        <div className={styles.form}>
          <div className={styles.formHead}>
            <span className={styles.formTitle}>{card ? "Replace card" : "Add a card on file"}</span>
            {card && (
              <button type="button" className={styles.linkBtn} onClick={closeForm}>
                Cancel
              </button>
            )}
          </div>

          {isStripe ? (
            <>
              {setupError && (
                <>
                  <p className={styles.err}>{setupError}</p>
                  <button type="button" className={styles.linkBtn} onClick={retrySetup}>
                    Try again
                  </button>
                </>
              )}
              {!setupError && !clientSecret && <p className={styles.stub}>Opening secure form…</p>}
              {clientSecret && (
                <Elements
                  stripe={getStripe()}
                  options={{ clientSecret, appearance: appearance ?? undefined }}
                >
                  <StripeCardForm
                    onSaved={() => {
                      setJustSaved(true);
                      closeForm();
                      router.refresh();
                    }}
                  />
                </Elements>
              )}
            </>
          ) : (
            // Demo / rollback path: a typed card, no real money. Kept as a plain
            // form action so it works with JS off.
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
          )}
        </div>
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
          Charged {formatMoney(settleResult.chargedCents, currency)} to your card. Thank you.
        </p>
      )}
      {settleResult && !settleResult.ok && <p className={styles.err}>{settleResult.error}</p>}
    </div>
  );
}
