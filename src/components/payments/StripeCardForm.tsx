"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadStripe, type Appearance, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { beginCardSetup, completeCardSetup } from "@/app/actions/payments";

/**
 * The ONE Payment Element implementation — used by the wallet on /tab and by
 * the card gate on the money-committing taps. The card number goes
 * browser → Stripe; this app only ever sees the SetupIntent id Stripe hands
 * back (PCI SAQ-A).
 */

/** Stripe.js loads once per page — its own requirement, not an optimization. */
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = pk ? loadStripe(pk) : Promise.resolve(null);
  }
  return stripePromise;
}

/**
 * Dress the Element in the page's own tokens, so a co-branded stay's card form
 * carries the PARTNER's accent instead of Stripe blue (co-brand doctrine:
 * Summit stays quiet, the brand on screen is theirs).
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
 * The host's own class names — this form is styled by whoever embeds it (the
 * wallet, the card gate) so it never carries a second visual language. Optional
 * because CSS-module lookups are `string | undefined` under
 * noUncheckedIndexedAccess, and className takes undefined happily.
 */
type Classes = {
  /** Wrapper around the Element + its button. */
  form?: string;
  button?: string;
  error?: string;
  note?: string;
};

export type SavedCardSummary = { brand: string; last4: string };

function CardFields({
  classes,
  saveLabel,
  note,
  onSaved,
}: {
  classes: Classes;
  saveLabel: string;
  note: string | null;
  onSaved: (card: SavedCardSummary) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!stripe || !elements || saving) return;
    setSaving(true);
    setError(null);

    const confirmed = await stripe.confirmSetup({ elements, redirect: "if_required" });
    if (confirmed.error || !confirmed.setupIntent) {
      setError(confirmed.error?.message ?? "That card didn’t save — please try again.");
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
    onSaved({ brand: res.brand, last4: res.last4 });
  };

  return (
    <div className={classes.form}>
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className={classes.error}>{error}</p>}
      {/* type=button on purpose: this sits INSIDE host forms (the wizard is one
          big form) and must never submit them. */}
      <button type="button" disabled={saving} onClick={submit} className={classes.button}>
        {saving ? "Saving…" : saveLabel}
      </button>
      {note && <p className={classes.note}>{note}</p>}
    </div>
  );
}

/**
 * Mints a SetupIntent on mount and renders the Element. Callers decide when to
 * mount it — an untouched page must not create Stripe objects.
 */
export default function StripeCardForm({
  classes,
  saveLabel = "Save card",
  note = null,
  onSaved,
}: {
  classes: Classes;
  saveLabel?: string;
  note?: string | null;
  onSaved: (card: SavedCardSummary) => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  // The ref (not the error/secret state) guards the request, so a failed setup
  // shows its message instead of retrying in a loop.
  const requestedRef = useRef(false);

  const start = useCallback(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    setSetupError(null);
    setAppearance(elementsAppearance());
    void beginCardSetup().then((res) => {
      if (!res.ok) {
        setSetupError(res.error);
        return;
      }
      if (res.setup.mode === "element") setClientSecret(res.setup.clientSecret);
      else setSetupError("Card setup isn’t available here.");
    });
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  if (setupError) {
    return (
      <div className={classes.form}>
        <p className={classes.error}>{setupError}</p>
        <button
          type="button"
          className={classes.button}
          onClick={() => {
            requestedRef.current = false;
            start();
          }}
        >
          Try again
        </button>
      </div>
    );
  }
  if (!clientSecret) return <p className={classes.note}>Opening secure form…</p>;

  return (
    <Elements
      stripe={getStripe()}
      options={{ clientSecret, appearance: appearance ?? undefined }}
    >
      <CardFields
        classes={classes}
        saveLabel={saveLabel}
        note={note}
        onSaved={onSaved}
      />
    </Elements>
  );
}
