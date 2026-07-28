"use client";

import { useActionState } from "react";
import { chargeTabLine, type OpsResult } from "@/app/actions/ops";
import styles from "@/app/ops/ops.module.css";

/**
 * Charge one PENDING line to the card on file. THE money tap — every charge in
 * the system starts here or on the guest's own Settle (money doctrine
 * 2026-07-27: no cron, no webhook, no auto-charge).
 */
export default function ChargeButton({
  tabLineItemId,
  label = "Charge",
}: {
  tabLineItemId: string;
  /** "Retry" after a decline — same action, a fresh idempotency key. */
  label?: string;
}) {
  const [state, action, pending] = useActionState<OpsResult | null, FormData>(
    chargeTabLine,
    null,
  );

  return (
    <form action={action} className={styles.inlineForm}>
      <input type="hidden" name="tabLineItemId" value={tabLineItemId} />
      <button type="submit" disabled={pending} className={styles.btn}>
        {pending ? "Charging…" : label}
      </button>
      {state && !state.ok && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
