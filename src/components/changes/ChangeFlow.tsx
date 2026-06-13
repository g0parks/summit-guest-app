"use client";

import { useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import type { ChangeKind } from "@prisma/client";
import { createChangeRequest, type ChangeResult } from "@/app/actions/changes";
import styles from "./ChangeFlow.module.css";

/**
 * The structured change ask — two screens, one tap each (Channel Doctrine:
 * structured taps, never composed messages). Options arrive pre-gated by the
 * server (cutoffs); the picked kind mirrors into a hidden input and one
 * submission carries everything (the IntakeFlow pattern). Renders its own
 * close screen — the action skips revalidation so it isn't unmounted
 * mid-result.
 */

export default function ChangeFlow({
  itemId,
  itemTitle,
  whenLabel,
  canMove,
  canCancel,
  defaultDate,
  tzHint,
}: {
  itemId: string;
  itemTitle: string;
  whenLabel: string;
  canMove: boolean;
  canCancel: boolean;
  /** The item's current date ("YYYY-MM-DD", property tz) — the picker's start. */
  defaultDate: string;
  /** "MST" / "MDT" — times are property-local. */
  tzHint: string;
}) {
  const [kind, setKind] = useState<ChangeKind | null>(null);
  const [state, formAction, pending] = useActionState<ChangeResult | null, FormData>(
    createChangeRequest,
    null,
  );

  // ── The close — handled, calm, done ────────────────────────────────────
  if (state?.ok) {
    const detail =
      state.kind === "CANCEL"
        ? "We're taking it off your itinerary — consider it unwound."
        : state.kind === "MOVE"
          ? "We're rearranging it — your itinerary will update once it's set."
          : "Your concierge is on it — you'll see the update on your itinerary.";
    return (
      <main className={styles.page}>
        <div className={`${styles.screen} ${styles.active}`}>
          <div className={styles.doneBody}>
            <span className="eyebrow">{itemTitle}</span>
            <h1 className={styles.headline}>Consider it handled.</h1>
            <p className={styles.detail}>{detail}</p>
            <div className={styles.doneLinks}>
              <Link href="/itinerary" className={styles.quietLink}>
                Back to your itinerary
              </Link>
              <Link href="/" className={styles.quietLink}>
                Back to your trip
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const screen: "options" | ChangeKind = kind ?? "options";

  return (
    <main className={styles.page}>
      <form action={formAction} className={styles.form}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="kind" value={kind ?? ""} />

        {/* ── Screen 1 · what kind of change ── */}
        <section
          className={`${styles.screen} ${screen === "options" ? styles.active : styles.hidden}`}
        >
          <header className={styles.topRow}>
            <Link href="/itinerary" className={styles.backBtn} aria-label="Back">
              <BackIcon />
            </Link>
          </header>
          <div className={styles.screenBody}>
            <span className="eyebrow">{itemTitle}</span>
            <h1 className={styles.question}>What should we change?</h1>
            <p className={styles.detail}>Currently {whenLabel}.</p>
          </div>
          <div className={styles.screenActions}>
            {canMove && (
              <button
                type="button"
                className={styles.optionBtn}
                onClick={() => setKind("MOVE")}
              >
                Move it
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                className={styles.optionBtn}
                onClick={() => setKind("CANCEL")}
              >
                Cancel it
              </button>
            )}
            <button
              type="button"
              className={styles.optionBtnQuiet}
              onClick={() => setKind("MODIFY")}
            >
              Something else
            </button>
          </div>
        </section>

        {/* ── Screen 2 · MOVE — when works better ── */}
        <section
          className={`${styles.screen} ${screen === "MOVE" ? styles.active : styles.hidden}`}
        >
          <header className={styles.topRow}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => setKind(null)}
              aria-label="Back"
            >
              <BackIcon />
            </button>
          </header>
          <div className={styles.screenBody}>
            <span className="eyebrow">{itemTitle}</span>
            <h1 className={styles.question}>When works better?</h1>
            <div className={styles.fields}>
              <label className={styles.fieldLabel}>
                <span>Day</span>
                <input
                  type="date"
                  name="requestedDate"
                  defaultValue={defaultDate}
                  className={styles.input}
                />
              </label>
              <label className={styles.fieldLabel}>
                <span>
                  Time ({tzHint}){" "}
                  <span className={styles.optional}>if you have one in mind</span>
                </span>
                <input type="time" name="requestedTime" className={styles.input} />
              </label>
            </div>
          </div>
          <div className={styles.screenActions}>
            {state && !state.ok && <p className={styles.error}>{state.error}</p>}
            <button type="submit" disabled={pending} className={styles.primaryBtn}>
              {pending ? "Sending…" : "Send to your concierge"}
            </button>
          </div>
        </section>

        {/* ── Screen 2 · CANCEL — confirm, gently ── */}
        <section
          className={`${styles.screen} ${screen === "CANCEL" ? styles.active : styles.hidden}`}
        >
          <header className={styles.topRow}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => setKind(null)}
              aria-label="Back"
            >
              <BackIcon />
            </button>
          </header>
          <div className={styles.screenBody}>
            <span className="eyebrow">{itemTitle}</span>
            <h1 className={styles.question}>Take it off the itinerary?</h1>
            <p className={styles.detail}>
              We&rsquo;ll handle the unwinding — no calls, no fuss.
            </p>
            {/* Two screens share name="note" (CANCEL + MODIFY) inside one
                mounted form — disable the inactive one so formData.get("note")
                resolves to the screen the guest is actually on, not the first
                in the DOM. (IntakeFlow's single-submission pattern only holds
                while field names are unique.) */}
            <textarea
              name="note"
              rows={3}
              className={styles.noteInput}
              placeholder="Anything we should know? Optional."
              disabled={screen !== "CANCEL"}
            />
          </div>
          <div className={styles.screenActions}>
            {state && !state.ok && <p className={styles.error}>{state.error}</p>}
            <button type="submit" disabled={pending} className={styles.primaryBtn}>
              {pending ? "Sending…" : "Cancel it"}
            </button>
            <button
              type="button"
              className={styles.skipBtn}
              onClick={() => setKind(null)}
            >
              Keep it as planned
            </button>
          </div>
        </section>

        {/* ── Screen 2 · MODIFY — the structured open ask ── */}
        <section
          className={`${styles.screen} ${screen === "MODIFY" ? styles.active : styles.hidden}`}
        >
          <header className={styles.topRow}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => setKind(null)}
              aria-label="Back"
            >
              <BackIcon />
            </button>
          </header>
          <div className={styles.screenBody}>
            <span className="eyebrow">{itemTitle}</span>
            <h1 className={styles.question}>Tell us what you need.</h1>
            <p className={styles.detail}>A line is plenty — we read every word.</p>
            <textarea
              name="note"
              rows={4}
              className={styles.noteInput}
              placeholder="One more for dinner, an earlier start, a different run…"
              disabled={screen !== "MODIFY"}
            />
          </div>
          <div className={styles.screenActions}>
            {state && !state.ok && <p className={styles.error}>{state.error}</p>}
            <button type="submit" disabled={pending} className={styles.primaryBtn}>
              {pending ? "Sending…" : "Send to your concierge"}
            </button>
          </div>
        </section>
      </form>
    </main>
  );
}

function BackIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
