"use client";

import { useActionState, useCallback, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import type { PriceUnit } from "@prisma/client";
import { saveRequestDetails, type WizardResult } from "@/app/actions/requests";
import {
  attachVisible,
  clampParty,
  perPersonName,
  serviceFlow,
  showIfFields,
  stepVisible,
  type AttachOffer,
  type ServiceField,
  type SubField,
  type WizardStep,
} from "@/lib/serviceForm";
import { computeChargeCents, isFixedPrice } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import styles from "./RequestWizard.module.css";

/**
 * The guided completion wizard — the waiter taking the order (Product
 * Doctrine 2026-06-12). One question per screen in the /plan register;
 * every screen exits gracefully ("Finish later — we'll hold it"). All
 * panels stay MOUNTED inside one <form> (IntakeFlow pattern) so uncontrolled
 * fields keep their values and one submission carries everything. No HTML
 * `required` attributes — hidden mounted inputs would block submission;
 * the server validates on complete.
 */

type WizardService = {
  slug: string;
  name: string;
  priceUnit: PriceUnit;
  priceAmount: number | null;
  requiresDate: boolean;
  requiresTime: boolean;
  requiresPartySize: boolean;
};

type WizardDefaults = {
  date: string | null;
  time: string | null;
  partySize: number;
  notes: string | null;
  /** Saved detail values keyed by machine name — the resume state. */
  details: Record<string, string>;
};

type PerPersonField = Extract<ServiceField, { kind: "perPerson" }>;

type Screen =
  | { key: string; kind: "schedule" }
  | { key: string; kind: "fields"; step: WizardStep }
  | { key: string; kind: "person"; step: WizardStep; group: PerPersonField; person: number }
  | { key: string; kind: "attach"; attach: AttachOffer }
  | { key: string; kind: "notes" };

/** Field names referenced by any showIf — these selects drive conditional steps. */
function controllerNamesOf(flow: ReturnType<typeof serviceFlow>): Set<string> {
  const names = new Set<string>();
  for (const step of flow.steps) for (const f of showIfFields(step.showIf)) names.add(f);
  for (const a of flow.attaches ?? []) for (const f of showIfFields(a.showIf)) names.add(f);
  return names;
}

export default function RequestWizard({
  requestId,
  service,
  currency,
  backHref,
  defaults,
  seeds = {},
  feeStructure = null,
}: {
  requestId: string;
  service: WizardService;
  currency: string;
  backHref: string;
  defaults: WizardDefaults;
  /** Trip-derived visibility inputs (bar moments) — read-only, never a guest answer. */
  seeds?: Record<string, string>;
  /** Fee-structure (grocery + bar): the disclosure lines for the confirm
   *  screen, plus the "you're all set" close detail. */
  feeStructure?: {
    lead: string;
    summary: string;
    schedule: string[];
    degraded: string | null;
    closeDetail: string;
  } | null;
}) {
  const flow = useMemo(() => serviceFlow(service.slug), [service.slug]);
  const needsSchedule =
    service.requiresDate || service.requiresTime || service.requiresPartySize;

  const [party, setParty] = useState(clampParty(defaults.partySize));
  const [idx, setIdx] = useState(0);
  const [state, formAction, pending] = useActionState<WizardResult | null, FormData>(
    saveRequestDetails,
    null,
  );

  // Conditional steps: the controlling answers (e.g. mode, cookIn) live in
  // state so changing one re-derives the screen list — hidden steps drop out
  // (their inputs unmount, so nothing hidden is submitted). The same showIf
  // runs server-side, so client and server agree on what was shown.
  const controllerNames = useMemo(() => controllerNamesOf(flow), [flow]);
  const [controls, setControls] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    // Seeds win: a trip-derived signal (phase, cookOrChef) is a fixed
    // visibility input the guest never edits; only the real selects (mode)
    // fall through to saved-detail rehydration.
    for (const name of controllerNamesOf(flow)) {
      init[name] = seeds[name] ?? defaults.details[name] ?? "";
    }
    return init;
  });
  const controlFor = useCallback(
    (name: string) =>
      controllerNames.has(name)
        ? {
            value: controls[name] ?? "",
            onChange: (v: string) => setControls((c) => ({ ...c, [name]: v })),
          }
        : undefined,
    [controllerNames, controls],
  );

  const screens = useMemo(() => {
    const list: Screen[] = [];
    if (needsSchedule) list.push({ key: "schedule", kind: "schedule" });
    for (const step of flow.steps) {
      if (!stepVisible(step, controls)) continue;
      const group = step.fields.find((f): f is PerPersonField => f.kind === "perPerson");
      if (group) {
        for (let p = 1; p <= party; p++) {
          list.push({ key: `${step.key}:${p}`, kind: "person", step, group, person: p });
        }
      } else {
        list.push({ key: step.key, kind: "fields", step });
      }
    }
    for (const attach of flow.attaches ?? []) {
      if (attachVisible(attach, controls)) {
        list.push({ key: `attach:${attach.name}`, kind: "attach", attach });
      }
    }
    list.push({ key: "notes", kind: "notes" });
    return list;
  }, [flow, needsSchedule, party, controls]);

  // Party can shrink the screen list mid-flow — never strand the index.
  const current = Math.min(idx, screens.length - 1);
  const next = () => setIdx(Math.min(current + 1, screens.length - 1));
  const back = () => setIdx(Math.max(current - 1, 0));

  const fixed = isFixedPrice(service.priceUnit, service.priceAmount);
  const previewCents = fixed
    ? computeChargeCents(service.priceUnit, service.priceAmount as number, party)
    : null;

  // ── The close — one calm screen each ──────────────────────────────────
  // Fee-structure (grocery + bar) completes to READY (the operator prices it),
  // but from the guest's side the schedule consent IS the finish — so it closes
  // "You're all set", not the standard "Consider it underway".
  if (state?.ok) {
    const close =
      feeStructure && state.outcome === "ready"
        ? {
            headline: "You're all set.",
            detail: feeStructure.closeDetail,
            links: [{ href: "/", label: "Back to your trip" }],
          }
        : {
            confirmed: {
              headline: "You're all set.",
              detail:
                state.chargedCents != null
                  ? `${service.name} is arranged — ${formatMoney(state.chargedCents, currency)} on your tab, and it's on your itinerary.`
                  : `${service.name} is arranged — it's on your itinerary.`,
              links: [
                { href: "/tab", label: "View your tab" },
                { href: "/", label: "Back to your trip" },
              ],
            },
            ready: {
              headline: "Consider it underway.",
              detail:
                "Your concierge is putting it together — you'll see it come to life on your trip page.",
              links: [{ href: "/", label: "Back to your trip" }],
            },
            saved: {
              headline: "We'll hold it right here.",
              detail: "Pick it back up anytime from your trip page — nothing is lost.",
              links: [{ href: "/", label: "Back to your trip" }],
            },
          }[state.outcome];

    // Honest note when a cross-attach sibling was just started (it's SIGNALED,
    // not booked) — the guest finishes it from the home checklist.
    const attachNote =
      state.attached && state.attached.length > 0
        ? `We've also started ${state.attached.join(" & ")} — finish it from your trip page when you're ready.`
        : null;

    return (
      <main className={styles.page}>
        <div className={`${styles.screen} ${styles.active}`}>
          <div className={styles.doneBody}>
            <span className="eyebrow">{service.name}</span>
            <h1 className={styles.headline}>{close.headline}</h1>
            <p className={styles.detail}>{close.detail}</p>
            {attachNote && <p className={styles.detail}>{attachNote}</p>}
            <div className={styles.doneLinks}>
              {close.links.map((l) => (
                <Link key={l.href} href={l.href} className={styles.quietLink}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <form action={formAction} className={styles.form}>
        <input type="hidden" name="requestId" value={requestId} />

        {screens.map((screen, si) => {
          const activeCls = si === current ? styles.active : styles.hidden;
          return (
            <section key={screen.key} className={`${styles.screen} ${activeCls}`}>
              <header className={styles.topRow}>
                {si === 0 ? (
                  <Link href={backHref} className={styles.backBtn} aria-label="Back">
                    <BackIcon />
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={styles.backBtn}
                    onClick={back}
                    aria-label="Back"
                  >
                    <BackIcon />
                  </button>
                )}
                <span
                  className={styles.dots}
                  aria-label={`Step ${si + 1} of ${screens.length}`}
                >
                  {screens.map((d, di) => (
                    <span
                      key={d.key}
                      className={`${styles.dot} ${di === si ? styles.dotOn : ""}`}
                      aria-hidden="true"
                    />
                  ))}
                </span>
              </header>

              <div className={styles.screenBody}>
                {screen.kind === "schedule" && (
                  <>
                    <span className="eyebrow">{service.name}</span>
                    <h1 className={styles.question}>When should we plan it for?</h1>
                    <div className={styles.fields}>
                      {service.requiresDate && (
                        <label className={styles.fieldLabel}>
                          <span>Date</span>
                          <input
                            type="date"
                            name="date"
                            defaultValue={defaults.date ?? ""}
                            className={styles.input}
                          />
                        </label>
                      )}
                      {service.requiresTime && (
                        <label className={styles.fieldLabel}>
                          <span>
                            Preferred time <span className={styles.optional}>optional</span>
                          </span>
                          <input
                            type="time"
                            name="time"
                            defaultValue={defaults.time ?? ""}
                            className={styles.input}
                          />
                        </label>
                      )}
                      {service.requiresPartySize && (
                        <label className={styles.fieldLabel}>
                          <span>How many of you?</span>
                          <select
                            name="partySize"
                            value={party}
                            onChange={(e) => setParty(clampParty(Number(e.target.value)))}
                            className={styles.input}
                          >
                            {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </>
                )}

                {screen.kind === "fields" && (
                  <>
                    <span className="eyebrow">{screen.step.eyebrow}</span>
                    <h1 className={styles.question}>{screen.step.question}</h1>
                    {screen.step.detail && (
                      <p className={styles.detail}>{screen.step.detail}</p>
                    )}
                    <div className={styles.fields}>
                      {screen.step.fields
                        .filter(
                          (f): f is Exclude<ServiceField, PerPersonField> =>
                            f.kind !== "perPerson",
                        )
                        .map((field) => (
                          <Field
                            key={field.name}
                            field={field}
                            saved={defaults.details}
                            control={controlFor(field.name)}
                          />
                        ))}
                    </div>
                  </>
                )}

                {screen.kind === "person" && (
                  <>
                    <span className="eyebrow">{screen.step.eyebrow}</span>
                    <h1 className={styles.question}>
                      {screen.person === 1
                        ? screen.step.question
                        : `${screen.group.personNoun} ${screen.person}.`}
                    </h1>
                    {screen.person === 1 && screen.step.detail && (
                      <p className={styles.detail}>{screen.step.detail}</p>
                    )}
                    {party > 1 && (
                      <p className={styles.personTag}>
                        {screen.group.personNoun} {screen.person} of {party}
                      </p>
                    )}
                    <div className={styles.fields}>
                      {screen.group.fields.map((sub) => (
                        <SubFieldInput
                          key={sub.name}
                          sub={sub}
                          name={perPersonName(screen.group.name, screen.person, sub.name)}
                          saved={defaults.details}
                        />
                      ))}
                    </div>
                  </>
                )}

                {screen.kind === "attach" && (
                  <>
                    <span className="eyebrow">{screen.attach.eyebrow}</span>
                    <h1 className={styles.question}>{screen.attach.question}</h1>
                    {screen.attach.detail && (
                      <p className={styles.detail}>{screen.attach.detail}</p>
                    )}
                    <div className={styles.fields}>
                      <label className={styles.checkRow}>
                        <input
                          type="checkbox"
                          name={`attach_${screen.attach.name}`}
                          value="yes"
                          className={styles.checkbox}
                        />
                        <span>{screen.attach.cta}</span>
                      </label>
                    </div>
                  </>
                )}

                {screen.kind === "notes" && (
                  <>
                    <span className="eyebrow">One more thing</span>
                    <h1 className={styles.question}>
                      {flow.notesPrompt ?? "Anything else we should know?"}
                    </h1>
                    <textarea
                      name="notes"
                      rows={4}
                      className={styles.noteInput}
                      defaultValue={defaults.notes ?? ""}
                      placeholder={
                        flow.notesPlaceholder ?? "Allergies, preferences, timing…"
                      }
                    />
                  </>
                )}
              </div>

              <div className={styles.screenActions}>
                {screen.kind === "notes" ? (
                  <>
                    {state && !state.ok && <p className={styles.error}>{state.error}</p>}
                    {/* Fee-structure (grocery + bar): the value leads, the cost
                        is one calm line, and the concrete schedule sits behind a
                        quiet expand — disclosed, never a bullet-wall above the
                        button. The guest consents to the structure, not a total. */}
                    {feeStructure ? (
                      <div className={styles.feeStructure}>
                        <p className={styles.feeLead}>{feeStructure.lead}</p>
                        {feeStructure.degraded && (
                          <p className={styles.feeDegraded}>{feeStructure.degraded}</p>
                        )}
                        <p className={styles.feeSummary}>{feeStructure.summary}</p>
                        <details className={styles.feeDetails}>
                          <summary>See how it&rsquo;s priced</summary>
                          <ul>
                            {feeStructure.schedule.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </details>
                      </div>
                    ) : (
                      previewCents != null && (
                        <p className={styles.priceLine}>
                          {formatMoney(previewCents, currency)} — billed to your tab
                        </p>
                      )
                    )}
                    <button
                      type="submit"
                      name="mode"
                      value="complete"
                      disabled={pending}
                      className={styles.primaryBtn}
                    >
                      {pending
                        ? "Sending…"
                        : feeStructure
                          ? "Set it up"
                          : fixed
                            ? "Arrange it"
                            : "Send to your concierge"}
                    </button>
                  </>
                ) : (
                  <button type="button" className={styles.primaryBtn} onClick={next}>
                    Continue
                  </button>
                )}
                <button
                  type="submit"
                  name="mode"
                  value="later"
                  disabled={pending}
                  className={styles.skipBtn}
                >
                  Finish later — we&rsquo;ll hold it
                </button>
              </div>
            </section>
          );
        })}
      </form>
    </main>
  );
}

/* ── field renderers — uncontrolled, rehydrated from saved details ──
 * Exception: a field that drives a showIf (a "controller", e.g. mode/cookIn)
 * is rendered CONTROLLED so changing it re-derives the screen list. */

type Control = { value: string; onChange: (v: string) => void };

function Field({
  field,
  saved,
  control,
}: {
  field: Exclude<ServiceField, PerPersonField>;
  saved: Record<string, string>;
  control?: Control;
}) {
  if (field.kind === "checkboxes") {
    const picked = (saved[field.name] ?? "").split(";").map((s) => s.trim());
    return (
      <fieldset className={styles.checkGroup}>
        {field.options.map((opt) => (
          <label key={opt} className={styles.checkRow}>
            <input
              type="checkbox"
              name={`detail_${field.name}`}
              value={opt}
              defaultChecked={picked.includes(opt)}
              className={styles.checkbox}
            />
            <span>{opt}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  if (field.kind === "textarea") {
    return (
      <label className={styles.fieldLabel}>
        <span>{field.label}</span>
        <textarea
          name={`detail_${field.name}`}
          rows={3}
          defaultValue={saved[field.name] ?? ""}
          placeholder={field.placeholder}
          className={styles.noteInput}
        />
      </label>
    );
  }
  return <SubFieldInput sub={field} name={field.name} saved={saved} control={control} />;
}

function SubFieldInput({
  sub,
  name,
  saved,
  control,
}: {
  sub: SubField;
  name: string;
  saved: Record<string, string>;
  control?: Control;
}) {
  if (sub.kind === "select") {
    // A default pre-selects an option (kit-box "on") and drops the empty
    // placeholder; a controller binds value/onChange so showIf reacts live.
    const hasDefault = sub.default != null;
    const binding = control
      ? { value: control.value, onChange: (e: ChangeEvent<HTMLSelectElement>) => control.onChange(e.target.value) }
      : { defaultValue: saved[name] ?? sub.default ?? "" };
    return (
      <label className={styles.fieldLabel}>
        <span>{sub.label}</span>
        <select name={`detail_${name}`} className={styles.input} {...binding}>
          {!hasDefault && <option value="">Choose…</option>}
          {sub.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const textBinding = control
    ? { value: control.value, onChange: (e: ChangeEvent<HTMLInputElement>) => control.onChange(e.target.value) }
    : { defaultValue: saved[name] ?? "" };
  return (
    <label className={styles.fieldLabel}>
      <span>{sub.label}</span>
      <input
        name={`detail_${name}`}
        placeholder={sub.placeholder}
        className={styles.input}
        {...textBinding}
      />
    </label>
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
