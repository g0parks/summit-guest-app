"use client";

import { useState, useActionState } from "react";
import { optInTexts, type ConsentResult } from "@/app/actions/consent";
import { SMS_OPT_IN_LABEL, SMS_REASSURANCE } from "@/lib/consentCopy";
import styles from "./TextUpdatesPrompt.module.css";

/**
 * The text opt-in card — rendered pre-arrival only while the guest hasn't
 * opted in (it retires itself the moment they do). Quiet and ignorable by
 * design, the RentalCarPrompt register: an offer of convenience, never a
 * gate. This is the load-bearing capture — SMS is the one proactive channel
 * that reliably lands (no native push) — but the card never says that; it
 * just makes the offer plainly and shows the reassurance line (the versioned
 * TCPA disclosure, consentCopy.ts).
 */
export default function TextUpdatesPrompt({ defaultPhone }: { defaultPhone: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ConsentResult | null, FormData>(
    optInTexts,
    null,
  );

  if (state?.ok) {
    return (
      <section className={`${styles.prompt} reveal reveal-4`}>
        <p className={styles.doneLine}>Noted. We&rsquo;ll only text when it matters.</p>
      </section>
    );
  }

  return (
    <section className={`${styles.prompt} reveal reveal-4`}>
      <span className="eyebrow">Texts, if you like</span>
      <h2 className={styles.question}>Want updates by text?</h2>
      <p className={styles.detail}>{SMS_REASSURANCE}</p>

      {open ? (
        <form action={action} className={styles.form}>
          <label className={styles.fieldLabel}>
            <span>Your number</span>
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              defaultValue={defaultPhone}
              placeholder="(435) 555-0100"
              className={styles.input}
            />
          </label>
          {state && !state.ok && <p className={styles.error}>{state.error}</p>}
          <button type="submit" disabled={pending} className={styles.choice}>
            {pending ? "One moment…" : SMS_OPT_IN_LABEL}
          </button>
        </form>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.choice} onClick={() => setOpen(true)}>
            {SMS_OPT_IN_LABEL}
          </button>
        </div>
      )}
    </section>
  );
}
