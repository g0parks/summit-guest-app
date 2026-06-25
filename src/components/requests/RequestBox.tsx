"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createRequestBox, type RequestBoxResult } from "@/app/actions/requests";
import styles from "./RequestWizard.module.css";

/**
 * The request box — "Something else? We'll arrange it." The in-app capture for
 * anything off the menu (the menu doctrine's waiter saying "we can do that,"
 * not a configurator). One calm screen: what, optionally when. The concierge
 * fee posture is disclosed here, never quoted on the spot — milk, not meat.
 * Shares the wizard's styling so it reads as one experience.
 */
export default function RequestBox() {
  const [state, action, pending] = useActionState<RequestBoxResult | null, FormData>(
    createRequestBox,
    null,
  );

  if (state?.ok) {
    return (
      <main className={styles.page}>
        <div className={`${styles.screen} ${styles.active}`}>
          <div className={styles.doneBody}>
            <span className="eyebrow">The concierge</span>
            <h1 className={styles.headline}>Consider it in motion.</h1>
            <p className={styles.detail}>
              Your concierge will follow up in the app by end of day. Look for it
              on your trip page.
            </p>
            <div className={styles.doneLinks}>
              <Link href="/" className={styles.quietLink}>
                Back to your trip
              </Link>
              <Link href="/services" className={styles.quietLink}>
                Browse the concierge
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <form action={action} className={styles.form}>
        <div className={`${styles.screen} ${styles.active}`}>
          <div className={styles.screenBody}>
            <span className="eyebrow">The concierge</span>
            <h1 className={styles.question}>What can we arrange?</h1>
            <p className={styles.detail}>
              If it&rsquo;s not on the menu, we&rsquo;ll still take care of it. Just tell
              us what you have in mind.
            </p>
            <div className={styles.fields}>
              <label className={styles.fieldLabel}>
                <span>Your request</span>
                <textarea
                  name="ask"
                  rows={4}
                  required
                  className={styles.noteInput}
                  placeholder="A sitter Thursday night, flowers for an anniversary, a table at Riverhorse…"
                />
              </label>
              <label className={styles.fieldLabel}>
                <span>
                  Any particular day? <span className={styles.optional}>optional</span>
                </span>
                <input type="date" name="date" className={styles.input} />
              </label>
            </div>
            <p className={styles.detail}>
              Handled personally by your concierge. If there&rsquo;s a cost,
              you&rsquo;ll see a quote to approve first. Nothing&rsquo;s booked until
              you say yes.
            </p>
          </div>

          <div className={styles.screenActions}>
            {state && !state.ok && <p className={styles.error}>{state.error}</p>}
            <button type="submit" disabled={pending} className={styles.primaryBtn}>
              {pending ? "Sending…" : "Send to your concierge"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}
