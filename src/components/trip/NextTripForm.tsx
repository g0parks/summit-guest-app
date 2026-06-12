"use client";

import { useState, useActionState } from "react";
import { submitReturnIntent, type IntakeResult } from "@/app/actions/intake";
import styles from "./NextTripForm.module.css";

/**
 * The ONE post-stay call to action: "Have us along next time." Tapping it
 * unfolds a single optional timing field — the token is identity, so we ask
 * for nothing we already know. Submits a return-intent TripIntake; the
 * operator picks it up in the same intakes queue as every other lead.
 */
export default function NextTripForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<IntakeResult | null, FormData>(
    submitReturnIntent,
    null,
  );

  if (state?.ok) {
    return (
      <div className={styles.done}>
        <span className={styles.check} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </span>
        <h2 className={styles.doneTitle}>Consider it noted.</h2>
        <p className={styles.doneBody}>
          When your next trip starts taking shape, we&rsquo;ll already be on it.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className={styles.cta} onClick={() => setOpen(true)}>
        Have us along next time
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    );
  }

  return (
    <form action={action} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>
          When are you thinking? <span className={styles.optional}>optional</span>
        </span>
        <input
          name="tripTiming"
          className={styles.input}
          placeholder={"Presidents’ week, next Christmas, sometime in March…"}
          maxLength={200}
          autoFocus
        />
      </label>
      {state && !state.ok && <p className={styles.error}>{state.error}</p>}
      <button type="submit" disabled={pending} className={styles.cta}>
        {pending ? "Sending…" : "Count us in"}
      </button>
    </form>
  );
}
