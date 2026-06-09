"use client";

import { useActionState } from "react";
import { quoteRequest, type OpsResult } from "@/app/actions/ops";
import styles from "@/app/ops/ops.module.css";

/** Inline quote form for a REQUESTED (un-priced) request. Amounts in dollars. */
export default function QuoteForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<OpsResult | null, FormData>(
    quoteRequest,
    null,
  );

  // On success the page revalidates and the request leaves the REQUESTED
  // state, so this form unmounts — only the error path renders here.
  return (
    <form action={action} className={styles.inlineForm}>
      <input type="hidden" name="requestId" value={requestId} />
      <input
        name="amount"
        inputMode="decimal"
        placeholder="quote $"
        required
        className={styles.input}
        aria-label="Quote amount (dollars)"
      />
      <input
        name="vendorCost"
        inputMode="decimal"
        placeholder="vendor $"
        className={styles.input}
        aria-label="Vendor cost (dollars)"
      />
      <button type="submit" disabled={pending} className={styles.btn}>
        {pending ? "Quoting…" : "Quote & confirm"}
      </button>
      {state && !state.ok && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
