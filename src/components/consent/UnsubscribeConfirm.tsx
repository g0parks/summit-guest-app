"use client";

import { useActionState } from "react";
import { confirmUnsubscribe, type ConsentResult } from "@/app/actions/consent";
import styles from "./UnsubscribeConfirm.module.css";

/** The one confirm tap — a POST, so scanners prefetching the GET can't opt
 *  a guest out by accident. No guilt copy, no "are you sure" theater. */
export default function UnsubscribeConfirm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [state, action, pending] = useActionState<ConsentResult | null, FormData>(
    confirmUnsubscribe,
    null,
  );

  if (state?.ok) {
    return (
      <>
        <h1 className={styles.title}>Done.</h1>
        <p className={styles.body}>
          {email} is unsubscribed. We won&rsquo;t email you.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.title}>Unsubscribe?</h1>
      <p className={styles.body}>
        We&rsquo;ll stop emailing {email}. Your trip link keeps working either way.
      </p>
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        {state && !state.ok && <p className={styles.error}>{state.error}</p>}
        <button type="submit" disabled={pending} className={styles.confirm}>
          {pending ? "One moment…" : "Unsubscribe"}
        </button>
      </form>
    </>
  );
}
