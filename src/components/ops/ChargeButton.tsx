"use client";

import { useActionState } from "react";
import { chargeTabLine, type OpsResult } from "@/app/actions/ops";
import styles from "@/app/ops/ops.module.css";

/** Charge one PENDING line to the card on file (mock provider today). */
export default function ChargeButton({ tabLineItemId }: { tabLineItemId: string }) {
  const [state, action, pending] = useActionState<OpsResult | null, FormData>(
    chargeTabLine,
    null,
  );

  return (
    <form action={action} className={styles.inlineForm}>
      <input type="hidden" name="tabLineItemId" value={tabLineItemId} />
      <button type="submit" disabled={pending} className={styles.btn}>
        {pending ? "Charging…" : "Charge"}
      </button>
      {state && !state.ok && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
