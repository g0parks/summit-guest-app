"use client";

import { useActionState } from "react";
import { priceProvisioningOrder, type OpsResult } from "@/app/actions/ops";
import styles from "@/app/ops/ops.module.css";

/**
 * Inline pricing for a READY fee-structure (grocery + bar) order. The operator
 * curates/shops the order and enters its pass-through cost in dollars; the
 * charge — cost + the disclosed fees, against the order-time rush state — is
 * computed server-side, lands on the tab, and moves the order to CONFIRMED. No
 * second guest tap: they already approved the fee schedule on completion.
 */
export default function ProvisioningPriceForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<OpsResult | null, FormData>(
    priceProvisioningOrder,
    null,
  );

  // On success the page revalidates and the order leaves READY, so this form
  // unmounts — only the error path renders here.
  return (
    <form action={action} className={styles.inlineForm}>
      <input type="hidden" name="requestId" value={requestId} />
      <input
        name="cost"
        inputMode="decimal"
        placeholder="order cost $"
        required
        className={styles.input}
        aria-label="Order cost — pass-through (dollars)"
      />
      <button type="submit" disabled={pending} className={styles.btn}>
        {pending ? "Pricing…" : "Price the order"}
      </button>
      {state && !state.ok && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
