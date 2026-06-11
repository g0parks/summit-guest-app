"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { submitTripIntake, type IntakeResult } from "@/app/actions/intake";
import { INTAKE_QUESTIONS, type IntakeAnswerValue } from "@/lib/intakeFlow";
import ConciergeLinks from "@/components/concierge/ConciergeLinks";
import styles from "./IntakeFlow.module.css";

/**
 * The guided trip-intake — a calm step machine, not a form. One question per
 * screen, one-tap answers, every screen exits gracefully. Tone rule: we're
 * taking care of you; if it ever feels pushy, it's wrong.
 *
 * All step panels stay MOUNTED (inactive ones display:none) inside one
 * <form>, so uncontrolled fields keep their values and the single submission
 * at the end carries everything via plain FormData. Answer taps are buttons
 * that write state mirrored into hidden inputs.
 */

type KnownStay = {
  guestFirstName: string;
  propertyName: string;
  dateRange: string;
};

export default function IntakeFlow({
  knownStay,
  utm,
  source,
  conciergePhone,
  conciergeEmail,
  conciergeMessage,
}: {
  knownStay: KnownStay | null;
  utm: Record<string, string> | null;
  source: string | null;
  conciergePhone: string | null;
  conciergeEmail: string | null;
  conciergeMessage: string;
}) {
  // welcome → q0..q4 → capstone → contact (anonymous only); done = state.ok
  const stepKeys = [
    "welcome",
    ...INTAKE_QUESTIONS.map((q) => `q:${q.key}`),
    "capstone",
    ...(knownStay ? [] : ["contact"]),
  ];
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, IntakeAnswerValue>>({});
  const [skippedContact, setSkippedContact] = useState(false);
  const [state, formAction, pending] = useActionState<IntakeResult | null, FormData>(
    submitTripIntake,
    null,
  );

  const step = stepKeys[stepIdx] ?? "welcome";
  const conciergeLive = Boolean(conciergePhone || conciergeEmail);
  const next = () => setStepIdx((i) => Math.min(i + 1, stepKeys.length - 1));
  const back = () => setStepIdx((i) => Math.max(i - 1, 0));

  const answerAndAdvance = (key: string, value: IntakeAnswerValue) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    next();
  };

  // ── The close — something has STARTED, not ended ──────────────────────
  if (state?.ok) {
    return (
      <main className={styles.page}>
        <div className={`${styles.screen} ${styles.active}`}>
          <span className={styles.wordmark}>SUMMIT</span>
          <div className={styles.doneBody}>
            <h1 className={styles.headline}>
              {skippedContact ? "Enjoy the mountain." : "Your concierge is on it."}
            </h1>
            <p className={styles.detail}>
              {skippedContact
                ? "Whenever you're ready, we're one text away."
                : knownStay
                  ? "We'll weave this into your stay — watch your itinerary."
                  : "A real person is putting your trip plan together — we'll have it over to you shortly."}
            </p>
            {conciergeLive && (
              <div className={styles.doneConcierge}>
                <ConciergeLinks
                  phone={conciergePhone}
                  email={conciergeEmail}
                  message={conciergeMessage}
                  variant="card"
                  smsLabel="Text your concierge"
                  emailLabel="Email your concierge"
                />
              </div>
            )}
            {knownStay && (
              <Link href="/" className={styles.quietLink}>
                Back to your trip
              </Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <form action={formAction} className={styles.form}>
        {/* accumulated answers + attribution ride the one submission */}
        {INTAKE_QUESTIONS.map((q) => (
          <input
            key={q.key}
            type="hidden"
            name={`answer_${q.key}`}
            value={answers[q.key] ?? ""}
          />
        ))}
        <input type="hidden" name="utm" value={utm ? JSON.stringify(utm) : ""} />
        <input type="hidden" name="source" value={source ?? ""} />

        {/* ── Welcome — an arrival, not a form ── */}
        <section
          className={`${styles.screen} ${step === "welcome" ? styles.active : styles.hidden}`}
        >
          <span className={styles.wordmark}>SUMMIT</span>
          <div className={styles.screenBody}>
            <span className="eyebrow">
              {knownStay
                ? `${knownStay.propertyName} · ${knownStay.dateRange}`
                : "Park City · your upcoming stay"}
            </span>
            <h1 className={styles.headline}>
              {knownStay
                ? `${knownStay.guestFirstName} — let's get your stay arranged.`
                : "Let's get your stay arranged."}
            </h1>
            <p className={styles.detail}>
              A few quick questions — your concierge handles the rest.
            </p>
          </div>
          <div className={styles.screenActions}>
            <button type="button" className={styles.primaryBtn} onClick={next}>
              Begin
            </button>
          </div>
        </section>

        {/* ── The questions — one per screen, presuppose the standard ── */}
        {INTAKE_QUESTIONS.map((q, qi) => (
          <section
            key={q.key}
            className={`${styles.screen} ${step === `q:${q.key}` ? styles.active : styles.hidden}`}
          >
            <header className={styles.topRow}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={back}
                aria-label="Back"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
              <span className={styles.dots} aria-label={`Question ${qi + 1} of ${INTAKE_QUESTIONS.length}`}>
                {INTAKE_QUESTIONS.map((d, di) => (
                  <span
                    key={d.key}
                    className={`${styles.dot} ${di === qi ? styles.dotOn : ""}`}
                    aria-hidden="true"
                  />
                ))}
              </span>
            </header>
            <div className={styles.screenBody}>
              <span className="eyebrow">{q.eyebrow}</span>
              <h1 className={styles.question}>{q.question}</h1>
              <p className={styles.detail}>{q.detail}</p>
            </div>
            <div className={styles.screenActions}>
              <button
                type="button"
                className={`${styles.answerBtn} ${styles.answerYes} ${
                  answers[q.key] === "interested" ? styles.answerChosen : ""
                }`}
                onClick={() => answerAndAdvance(q.key, "interested")}
              >
                {q.yesLabel}
              </button>
              <button
                type="button"
                className={`${styles.answerBtn} ${
                  answers[q.key] === "declined" ? styles.answerChosen : ""
                }`}
                onClick={() => answerAndAdvance(q.key, "declined")}
              >
                {q.passLabel}
              </button>
            </div>
          </section>
        ))}

        {/* ── Capstone — the open capture ── */}
        <section
          className={`${styles.screen} ${step === "capstone" ? styles.active : styles.hidden}`}
        >
          <header className={styles.topRow}>
            <button type="button" className={styles.backBtn} onClick={back} aria-label="Back">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </header>
          <div className={styles.screenBody}>
            <span className="eyebrow">One more thing</span>
            <h1 className={styles.question}>Anything else about your trip?</h1>
            <p className={styles.detail}>
              A celebration, dietary notes, something you&rsquo;re hoping for —
            </p>
            <textarea
              name="note"
              rows={4}
              className={styles.noteInput}
              placeholder="Tell us anything — we read every word."
            />
          </div>
          <div className={styles.screenActions}>
            {knownStay ? (
              <>
                {state && !state.ok && <p className={styles.error}>{state.error}</p>}
                <button type="submit" disabled={pending} className={styles.primaryBtn}>
                  {pending ? "Sending…" : "Send to your concierge"}
                </button>
              </>
            ) : (
              <button type="button" className={styles.primaryBtn} onClick={next}>
                Continue
              </button>
            )}
          </div>
        </section>

        {/* ── Contact — delivery, not signup. Anonymous only. ── */}
        {!knownStay && (
          <section
            className={`${styles.screen} ${step === "contact" ? styles.active : styles.hidden}`}
          >
            <header className={styles.topRow}>
              <button type="button" className={styles.backBtn} onClick={back} aria-label="Back">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
            </header>
            <div className={styles.screenBody}>
              <span className="eyebrow">Your trip plan</span>
              <h1 className={styles.question}>Where should we send your plan?</h1>
              <p className={styles.detail}>
                We&rsquo;ll pull it together and send it over — no account, no app.
              </p>
              <div className={styles.fields}>
                <label className={styles.fieldLabel}>
                  <span>Name</span>
                  <input name="name" autoComplete="name" className={styles.input} />
                </label>
                <label className={styles.fieldLabel}>
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    className={styles.input}
                  />
                </label>
                <label className={styles.fieldLabel}>
                  <span>Phone</span>
                  <input name="phone" type="tel" autoComplete="tel" className={styles.input} />
                </label>
                <label className={styles.fieldLabel}>
                  <span>
                    When&rsquo;s the trip? <span className={styles.optional}>roughly is fine</span>
                  </span>
                  <input
                    name="tripTiming"
                    className={styles.input}
                    placeholder="Mid-February, presidents’ week…"
                  />
                </label>
              </div>
            </div>
            <div className={styles.screenActions}>
              {state && !state.ok && <p className={styles.error}>{state.error}</p>}
              <button
                type="submit"
                name="contactMode"
                value="send"
                disabled={pending}
                className={styles.primaryBtn}
              >
                {pending ? "Sending…" : "Send my plan"}
              </button>
              <button
                type="submit"
                name="contactMode"
                value="skip"
                disabled={pending}
                className={styles.skipBtn}
                onClick={() => setSkippedContact(true)}
              >
                No thanks — just looking
              </button>
            </div>
          </section>
        )}
      </form>
    </main>
  );
}
