"use client";

import { useActionState } from "react";
import { ItineraryCategory } from "@prisma/client";
import type { OpsResult } from "@/app/actions/ops";
import styles from "@/app/ops/ops.module.css";

type Defaults = {
  title?: string;
  category?: ItineraryCategory;
  date?: string; // "YYYY-MM-DD" in the property tz
  time?: string; // "HH:mm" in the property tz; "" = all day
  endsAtTime?: string;
  location?: string;
  description?: string;
  sortOrder?: number;
  changePending?: boolean;
};

/**
 * Shared create/edit fields for an itinerary item. Client component so
 * validation errors from the action surface inline (useActionState — the
 * QuoteForm pattern) instead of a silent no-op. All date/time inputs are
 * wall-clock in the PROPERTY's timezone (labelled), parsed server-side via
 * zonedDateTime.
 */
export default function ItineraryItemForm({
  action,
  hidden,
  defaults = {},
  tzLabel,
  withChangePending = false,
  submitLabel,
}: {
  action: (prev: OpsResult | null, formData: FormData) => Promise<OpsResult>;
  hidden: Record<string, string>;
  defaults?: Defaults;
  tzLabel: string;
  withChangePending?: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<OpsResult | null, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className={styles.stackForm}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span>Title</span>
          <input
            name="title"
            required
            defaultValue={defaults.title}
            className={`${styles.input} ${styles.inputWide}`}
          />
        </label>
        <label className={styles.field}>
          <span>Category</span>
          <select
            name="category"
            defaultValue={defaults.category ?? "NOTE"}
            className={`${styles.input} ${styles.inputMid}`}
          >
            {Object.values(ItineraryCategory).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Sort</span>
          <input
            name="sortOrder"
            inputMode="numeric"
            defaultValue={String(defaults.sortOrder ?? 0)}
            className={styles.input}
          />
        </label>
      </div>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span>Date</span>
          <input
            type="date"
            name="date"
            required
            defaultValue={defaults.date}
            className={`${styles.input} ${styles.inputMid}`}
          />
        </label>
        <label className={styles.field}>
          <span>Time ({tzLabel}) — blank = all day</span>
          <input
            type="time"
            name="time"
            defaultValue={defaults.time}
            className={`${styles.input} ${styles.inputMid}`}
          />
        </label>
        <label className={styles.field}>
          <span>Ends ({tzLabel})</span>
          <input
            type="time"
            name="endsAtTime"
            defaultValue={defaults.endsAtTime}
            className={`${styles.input} ${styles.inputMid}`}
          />
        </label>
      </div>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span>Location</span>
          <input
            name="location"
            defaultValue={defaults.location}
            className={`${styles.input} ${styles.inputWide}`}
          />
        </label>
        <label className={styles.field}>
          <span>Details</span>
          <input
            name="description"
            defaultValue={defaults.description}
            className={`${styles.input} ${styles.inputWide}`}
          />
        </label>
      </div>

      {withChangePending && (
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            name="changePending"
            defaultChecked={defaults.changePending}
          />
          <span>Change pending — guest sees a quiet &ldquo;Being rearranged&rdquo; chip</span>
        </label>
      )}

      {state && !state.ok && <p className={styles.error}>{state.error}</p>}

      <div className={styles.actionsRow}>
        <button type="submit" disabled={pending} className={styles.btn}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
