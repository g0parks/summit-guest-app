"use client";

import { useActionState, useEffect, useState } from "react";
import { captureDemoLead, type DemoLeadResult } from "@/app/actions/demoLead";
import styles from "./DemoLeadPrompt.module.css";

// Let them actually explore first, THEN ask — earns the prompt. Layout-mounted,
// so this timer persists across demo screens (one ask per session).
const DELAY_MS = 35_000;
const SEEN_KEY = "aerie_demo_lead_seen";

/**
 * The demo's lead-capture slide-up. Rendered ONLY on demo sandboxes (the
 * layout gates on Stay.isDemo), so a real guest never sees it. Non-blocking,
 * dismissible, breaks the fourth wall to address the prospect — not the
 * sandbox "guest."
 */
export default function DemoLeadPrompt() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [state, action, pending] = useActionState<DemoLeadResult | null, FormData>(
    captureDemoLead,
    null,
  );

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return;
    } catch {
      /* sessionStorage unavailable — just run the timer */
    }
    const t = setTimeout(() => setOpen(true), DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!state?.ok) return;
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => setDone(true), 3500);
    return () => clearTimeout(t);
  }, [state]);

  function dismiss() {
    setDone(true);
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (done || !open) return null;

  return (
    <aside className={styles.wrap} role="dialog" aria-label="About Aerie">
      <button className={styles.x} onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
      {state?.ok ? (
        <div>
          <p className={styles.title}>Got it — we&apos;ll be in touch.</p>
          <p className={styles.sub}>Thanks for walking through Aerie.</p>
        </div>
      ) : (
        <>
          <p className={styles.title}>Liking what your guests would feel?</p>
          <p className={styles.sub}>
            This is the Aerie demo. Leave a number and we&apos;ll set you up for real.
          </p>
          <form action={action} className={styles.form}>
            <input
              className={styles.input}
              type="email"
              name="email"
              placeholder="Email"
              autoComplete="email"
            />
            <input
              className={styles.input}
              type="tel"
              name="phone"
              placeholder="Phone"
              autoComplete="tel"
            />
            <button className={styles.send} type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send →"}
            </button>
          </form>
          {state && !state.ok ? <p className={styles.err}>{state.error}</p> : null}
        </>
      )}
    </aside>
  );
}
