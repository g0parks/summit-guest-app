"use client";

import { useActionState } from "react";
import { createSignal, type SignalResult } from "@/app/actions/requests";
import styles from "./ArrangeButton.module.css";

/**
 * The one-tap signal — demand registered before a single detail is asked
 * (Product Doctrine: signal first, guided completion second). On success the
 * server action redirects into the wizard; this component only ever renders
 * the tap and, rarely, an error.
 */
export default function ArrangeButton({ serviceId }: { serviceId: string }) {
  const [state, formAction, pending] = useActionState<SignalResult | null, FormData>(
    createSignal,
    null,
  );

  return (
    <form action={formAction} className={styles.wrap}>
      <input type="hidden" name="serviceId" value={serviceId} />
      {state && !state.ok && <p className={styles.error}>{state.error}</p>}
      <button type="submit" disabled={pending} className={styles.cta}>
        {pending ? "One moment…" : "Arrange this"}
      </button>
      <p className={styles.reassure}>
        A few quick details next — nothing is booked or billed yet.
      </p>
    </form>
  );
}
