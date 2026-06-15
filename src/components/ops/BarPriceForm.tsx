"use client";

import { useActionState } from "react";
import { priceBarOrder, type OpsResult } from "@/app/actions/ops";
import styles from "@/app/ops/ops.module.css";

/**
 * Inline pricing for a READY (fee-structure) bar order. The operator curates
 * the bottles and enters their pass-through cost in dollars; the charge —
 * cost + the disclosed fees, against the order-time cadence — is computed
 * server-side, lands on the tab, and moves the order to CONFIRMED. No second
 * guest tap: they already approved the fee structure on completion.
 */
export default function BarPriceForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<OpsResult | null, FormData>(
    priceBarOrder,
    null,
  );

  // On success the page revalidates and the order leaves READY, so this form
  // unmounts — only the error path renders here.
  return (
    <form action={action} className={styles.inlineForm}>
      <input type="hidden" name="requestId" value={requestId} />
      <input
        name="bottleCost"
        inputMode="decimal"
        placeholder="bottle cost $"
        required
        className={styles.input}
        aria-label="Bottle cost — pass-through (dollars)"
      />
      <button type="submit" disabled={pending} className={styles.btn}>
        {pending ? "Pricing…" : "Price the bar"}
      </button>
      {state && !state.ok && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
