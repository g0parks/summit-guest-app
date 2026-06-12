"use client";

import { useActionState } from "react";
import { submitStayForm, type StayFormResult } from "@/app/actions/opsStays";
import GuestLinkPanel from "@/components/ops/GuestLinkPanel";
import styles from "@/app/ops/ops.module.css";

/**
 * ONE stay form for both ops entries: blank on /ops/stays/new (Entry A,
 * PMS-data-first), prefilled on /ops/intakes/[id] (Entry B, convert a lead —
 * pass intakeId). On success it renders the created panel in place.
 */

export type StayFormDefaults = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
};

export default function StayForm({
  properties,
  emailEnabled,
  intakeId,
  defaults,
  submitLabel,
}: {
  properties: { id: string; name: string }[];
  /** GUEST_EMAIL_FROM set — render the welcome-email toggle at all. */
  emailEnabled: boolean;
  intakeId?: string;
  defaults?: StayFormDefaults;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<StayFormResult | null, FormData>(
    submitStayForm,
    null,
  );

  if (state?.ok) {
    return (
      <GuestLinkPanel
        heading={`${state.guestFirstName} — ${state.propertyName}`}
        stayId={state.stayId}
        guestLink={state.guestLink}
        guestPhone={state.guestPhone}
        smsMessage={state.smsMessage}
        emailLine={state.emailLine}
      />
    );
  }

  return (
    <form action={action} className={styles.stackForm}>
      {intakeId && <input type="hidden" name="intakeId" value={intakeId} />}

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          Property
          <select
            name="propertyId"
            required
            className={`${styles.input} ${styles.inputWide}`}
            defaultValue={properties.length === 1 ? properties[0]!.id : ""}
          >
            <option value="" disabled>
              Choose…
            </option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Arrival
          <input type="date" name="arrival" required className={styles.inputMid} />
        </label>
        <label className={styles.field}>
          Departure
          <input type="date" name="departure" required className={styles.inputMid} />
        </label>
        <label className={styles.field}>
          Party
          <input
            type="number"
            name="partySize"
            min={1}
            max={20}
            className={styles.input}
          />
        </label>
      </div>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          First name
          <input
            name="firstName"
            required
            defaultValue={defaults?.firstName ?? ""}
            className={styles.inputMid}
          />
        </label>
        <label className={styles.field}>
          Last name
          <input
            name="lastName"
            defaultValue={defaults?.lastName ?? ""}
            className={styles.inputMid}
          />
        </label>
        <label className={styles.field}>
          Email
          <input
            type="email"
            name="email"
            defaultValue={defaults?.email ?? ""}
            className={`${styles.input} ${styles.inputWide}`}
          />
        </label>
        <label className={styles.field}>
          Phone
          <input
            type="tel"
            name="phone"
            defaultValue={defaults?.phone ?? ""}
            className={styles.inputMid}
          />
        </label>
      </div>

      {emailEnabled && (
        <label className={styles.checkRow}>
          <input type="checkbox" name="sendWelcome" defaultChecked />
          Send the welcome email with the trip link (needs a guest email)
        </label>
      )}

      {state && !state.ok && <p className={styles.error}>{state.error}</p>}

      <div className={styles.actionsRow}>
        <button type="submit" disabled={pending} className={styles.btn}>
          {pending ? "Creating…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
