"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { submitTripIntake, type IntakeResult } from "@/app/actions/intake";
import { brandCssVars, type Brand } from "@/lib/branding";
import type {
  IntakeAnswerValue,
  IntakeQuestion,
  ParameterQuestion,
} from "@/lib/intakeFlow";
import ConciergeLinks from "@/components/concierge/ConciergeLinks";
import { SMS_OPT_IN_LABEL, SMS_REASSURANCE } from "@/lib/consentCopy";
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
  questions,
  rentalCarQuestion,
  brand,
  knownStay,
  utm,
  source,
  conciergePhone,
  conciergeEmail,
  conciergeMessage,
}: {
  /** Season-keyed question set (intakeQuestionsFor) — the server picks. */
  questions: IntakeQuestion[];
  /** Stay-parameter capture (World A only); null = skip the screen entirely. */
  rentalCarQuestion: ParameterQuestion | null;
  /** World A: the stay's own co-brand. World B: resolved from ?partner= if present. Null = Summit default. */
  brand: Brand | null;
  knownStay: KnownStay | null;
  utm: Record<string, string> | null;
  source: string | null;
  conciergePhone: string | null;
  conciergeEmail: string | null;
  conciergeMessage: string;
}) {
  // welcome → airport → [rental car] → rest → capstone → contact (anon only).
  // The rental-car parameter rides right after "getting there" — it's a
  // stay fact, not a service interest, so it never enters `answers`.
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, IntakeAnswerValue>>({});
  const [rentalCar, setRentalCar] = useState<"yes" | "no" | "">("");
  const [skippedContact, setSkippedContact] = useState(false);
  const [state, formAction, pending] = useActionState<IntakeResult | null, FormData>(
    submitTripIntake,
    null,
  );

  // Conditional questions (e.g. the bar, shown only when grocery is declined)
  // drop in/out of the flow live as answers change.
  const activeQuestions = useMemo(
    () =>
      questions.filter(
        (q) => !q.showWhenDeclined || answers[q.showWhenDeclined] === "declined",
      ),
    [questions, answers],
  );
  const stepKeys = useMemo(() => {
    const qs = activeQuestions.flatMap((q) =>
      rentalCarQuestion && q.key === "airport-car"
        ? [`q:${q.key}`, "param:hasRentalCar"]
        : [`q:${q.key}`],
    );
    // The param usually rides after "getting there" — but signal-aware
    // filtering can remove that question (transfer already arranged). The
    // stay fact still needs capturing, so it leads instead of vanishing.
    if (rentalCarQuestion && !qs.includes("param:hasRentalCar")) {
      qs.unshift("param:hasRentalCar");
    }
    return ["welcome", ...qs, "capstone", ...(knownStay ? [] : ["contact"])];
  }, [activeQuestions, rentalCarQuestion, knownStay]);

  // Clamp: a conditional question dropping out can shrink stepKeys below the
  // current index — never strand the flow on a missing screen.
  const step = stepKeys[Math.min(stepIdx, stepKeys.length - 1)] ?? "welcome";
  const conciergeLive = Boolean(conciergePhone || conciergeEmail);
  const next = () => setStepIdx((i) => Math.min(i + 1, stepKeys.length - 1));
  const back = () => setStepIdx((i) => Math.max(i - 1, 0));

  const answerAndAdvance = (key: string, value: IntakeAnswerValue) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    next();
  };

  const answerRentalCarAndAdvance = (value: "yes" | "no") => {
    setRentalCar(value);
    next();
  };

  // Co-brand (World A): the stay's brand leads, Summit stays quiet — same
  // lockup as the welcome threshold. World B (no brand) keeps the wordmark.
  const brandVars = brand
    ? (brandCssVars(brand) as React.CSSProperties | undefined)
    : undefined;
  const lockup = brand?.poweredBy ? (
    <div className={styles.lockup}>
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt={brand.label} className={styles.brandLogo} />
      ) : (
        <span className={styles.brandLabel}>{brand.label}</span>
      )}
      <span className={styles.poweredBy}>powered by Summit</span>
    </div>
  ) : (
    <span className={styles.wordmark}>SUMMIT</span>
  );

  // ── The close — a confirmation with a delivery time, not a contact CTA
  //    (Channel Doctrine 2026-06-12: the app is the interface; texting is
  //    the quiet escape hatch, never the primary action) ──────────────────
  if (state?.ok) {
    return (
      <main className={styles.page} style={brandVars}>
        <div className={`${styles.screen} ${styles.active}`}>
          {lockup}
          <div className={styles.doneBody}>
            <h1 className={styles.headline}>
              {skippedContact ? "Enjoy the mountain." : "Your concierge is on it."}
            </h1>
            <p className={styles.detail}>
              {skippedContact
                ? "Whenever you're ready, you know where to find us."
                : knownStay
                  ? "We're weaving it into your stay. It'll be on your itinerary by end of day."
                  : "Your concierge is putting the plan together. You'll have it by end of day."}
            </p>
            {conciergeLive && !skippedContact && (
              <p className={styles.soonerLine}>
                Need us sooner?{" "}
                <ConciergeLinks
                  phone={conciergePhone}
                  email={conciergeEmail}
                  message={conciergeMessage}
                  variant="inline"
                  smsLabel="Text us"
                  emailLabel="Email us"
                />
              </p>
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
    <main className={styles.page} style={brandVars}>
      <form action={formAction} className={styles.form}>
        {/* accumulated answers + attribution ride the one submission */}
        {activeQuestions.map((q) => (
          <input
            key={q.key}
            type="hidden"
            name={`answer_${q.key}`}
            value={answers[q.key] ?? ""}
          />
        ))}
        <input type="hidden" name="utm" value={utm ? JSON.stringify(utm) : ""} />
        <input type="hidden" name="source" value={source ?? ""} />
        {rentalCarQuestion && (
          <input type="hidden" name="hasRentalCar" value={rentalCar} />
        )}

        {/* ── Welcome — an arrival, not a form ── */}
        <section
          className={`${styles.screen} ${step === "welcome" ? styles.active : styles.hidden}`}
        >
          {lockup}
          <div className={styles.screenBody}>
            <span className="eyebrow">
              {knownStay
                ? `${knownStay.propertyName} · ${knownStay.dateRange}`
                : "Park City · your upcoming stay"}
            </span>
            <h1 className={styles.headline}>
              {knownStay
                ? `${knownStay.guestFirstName}, let's get your stay arranged.`
                : "Let's get your stay arranged."}
            </h1>
            <p className={styles.detail}>
              A few quick questions, and your concierge handles the rest.
            </p>
          </div>
          <div className={styles.screenActions}>
            <button type="button" className={styles.primaryBtn} onClick={next}>
              Begin
            </button>
          </div>
        </section>

        {/* ── The questions — one per screen, presuppose the standard ── */}
        {activeQuestions.map((q, qi) => (
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
              <span className={styles.dots} aria-label={`Question ${qi + 1} of ${activeQuestions.length}`}>
                {activeQuestions.map((d, di) => (
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

        {/* ── Rental car — a stay parameter, neutral either/or (World A) ── */}
        {rentalCarQuestion && (
          <section
            className={`${styles.screen} ${
              step === "param:hasRentalCar" ? styles.active : styles.hidden
            }`}
          >
            <header className={styles.topRow}>
              <button type="button" className={styles.backBtn} onClick={back} aria-label="Back">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
            </header>
            <div className={styles.screenBody}>
              <span className="eyebrow">{rentalCarQuestion.eyebrow}</span>
              <h1 className={styles.question}>{rentalCarQuestion.question}</h1>
              <p className={styles.detail}>{rentalCarQuestion.detail}</p>
            </div>
            <div className={styles.screenActions}>
              <button
                type="button"
                className={`${styles.answerBtn} ${
                  rentalCar === "yes" ? styles.answerChosen : ""
                }`}
                onClick={() => answerRentalCarAndAdvance("yes")}
              >
                {rentalCarQuestion.trueLabel}
              </button>
              <button
                type="button"
                className={`${styles.answerBtn} ${
                  rentalCar === "no" ? styles.answerChosen : ""
                }`}
                onClick={() => answerRentalCarAndAdvance("no")}
              >
                {rentalCarQuestion.falseLabel}
              </button>
            </div>
          </section>
        )}

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
              A celebration, a dietary note, something you&rsquo;re hoping for.
            </p>
            <textarea
              name="note"
              rows={4}
              className={styles.noteInput}
              placeholder="Tell us anything. We read every word."
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
                We&rsquo;ll pull it together and send it over. No account to make.
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
                {/* TCPA express consent — recorded on the lead, applied to the
                    Guest at conversion. Ignored when phone stays empty. */}
                <label className={styles.smsOptIn}>
                  <input type="checkbox" name="smsOptIn" className={styles.smsCheckbox} />
                  <span>
                    {SMS_OPT_IN_LABEL}
                    <span className={styles.smsOptInNote}>{SMS_REASSURANCE}</span>
                  </span>
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
                No thanks, just looking
              </button>
            </div>
          </section>
        )}
      </form>
    </main>
  );
}
