"use client";

import { useActionState } from "react";
import { requestOpsMagicLink, type OpsAuthResult } from "@/app/actions/opsAuth";
import styles from "./ops-login.module.css";

// Ungated by design (top-level, not under /ops) — it's the door you reach
// BEFORE you have the cookie. Sends a one-time link to the ops inbox.
export default function OpsLogin() {
  const [state, action, pending] = useActionState<OpsAuthResult | null, FormData>(
    requestOpsMagicLink,
    null,
  );

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Summit Ops</h1>
        {state?.ok ? (
          <p className={styles.sub}>
            Check your inbox — a sign-in link is on its way. It expires in 15 minutes.
          </p>
        ) : (
          <>
            <p className={styles.sub}>Sign in to the console. We&apos;ll email a one-time link.</p>
            <form action={action}>
              <button className={styles.btn} type="submit" disabled={pending}>
                {pending ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>
            {state && !state.ok ? <p className={styles.err}>{state.error}</p> : null}
          </>
        )}
      </div>
    </main>
  );
}
