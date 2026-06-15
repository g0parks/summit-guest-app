"use client";

import { useState, useTransition } from "react";
import { setStayRentalCar } from "@/app/actions/stay";
import { RENTAL_CAR_QUESTION } from "@/lib/intakeFlow";
import styles from "./RentalCarPrompt.module.css";

/**
 * In-app fallback for the rental-car parameter — rendered pre-arrival only
 * when Stay.hasRentalCar is still unknown (a guest who skipped /plan). Quiet
 * and ignorable by design: a neutral either/or, never an upsell, no guilt for
 * leaving it. One tap writes the stay and the prompt retires. Copy is shared
 * with the /plan screen (RENTAL_CAR_QUESTION) so the two never drift.
 */
export default function RentalCarPrompt() {
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <section className={`${styles.prompt} reveal reveal-4`}>
        <p className={styles.doneLine}>Noted — thank you.</p>
      </section>
    );
  }

  const answer = (value: boolean) => {
    startTransition(async () => {
      const res = await setStayRentalCar(value);
      if (res.ok) setDone(true);
    });
  };

  return (
    <section className={`${styles.prompt} reveal reveal-4`}>
      <span className="eyebrow">{RENTAL_CAR_QUESTION.eyebrow}</span>
      <h2 className={styles.question}>{RENTAL_CAR_QUESTION.question}</h2>
      <p className={styles.detail}>{RENTAL_CAR_QUESTION.detail}</p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.choice}
          onClick={() => answer(true)}
          disabled={pending}
        >
          {RENTAL_CAR_QUESTION.trueLabel}
        </button>
        <button
          type="button"
          className={styles.choice}
          onClick={() => answer(false)}
          disabled={pending}
        >
          {RENTAL_CAR_QUESTION.falseLabel}
        </button>
      </div>
    </section>
  );
}
