"use client";

import { useActionState } from "react";
import { sendTouch, type TouchResult } from "@/app/actions/touchpoints";
import styles from "@/app/ops/ops.module.css";

/**
 * The pre-arrival cadence, surfaced — what's due, what's sent, what lapsed.
 * The system computes; the OPERATOR sends (one button per touch). Honest
 * status lines verbatim from the action; sent rows show the original record.
 */

export type TouchRowView = {
  kind: string;
  label: string;
  detail: string;
  dueLabel: string;
  status: "sent" | "due" | "upcoming" | "lapsed";
  sentLine: string | null; // "Mar 3 · email · guest@x.com"
};

const STATUS_BADGE: Record<TouchRowView["status"], string> = {
  sent: "badgeOk",
  due: "badgeAction",
  upcoming: "badgeNeutral",
  lapsed: "badgeVoid",
};

function TouchRow({
  stayId,
  row,
  canSend,
}: {
  stayId: string;
  row: TouchRowView;
  canSend: boolean;
}) {
  const [state, action, pending] = useActionState<TouchResult | null, FormData>(
    sendTouch,
    null,
  );
  const sentNow = state?.ok === true;

  return (
    <div className={styles.requestCard}>
      <div className={styles.requestHead}>
        <span className={styles.requestTitle}>{row.label}</span>
        <span
          className={`${styles.badge} ${styles[sentNow ? "badgeOk" : STATUS_BADGE[row.status]]}`}
        >
          {sentNow ? "SENT" : row.status.toUpperCase()}
        </span>
      </div>
      <p className={`${styles.small} ${styles.muted}`}>
        {row.detail} · due {row.dueLabel}
      </p>
      {row.sentLine && <p className={styles.small}>Sent {row.sentLine}</p>}
      {sentNow && state?.ok && <p className={styles.small}>{state.line}</p>}
      {state && !state.ok && <p className={styles.error}>{state.error}</p>}
      {!sentNow && row.status !== "sent" && row.status !== "lapsed" && canSend && (
        <form action={action} className={styles.actionsRow}>
          <input type="hidden" name="stayId" value={stayId} />
          <input type="hidden" name="kind" value={row.kind} />
          <button type="submit" disabled={pending} className={styles.btnGhost}>
            {pending ? "Sending…" : row.status === "due" ? "Send now" : "Send early"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function TouchpointsPanel({
  stayId,
  rows,
  emailEnabled,
  guestHasEmail,
}: {
  stayId: string;
  rows: TouchRowView[];
  emailEnabled: boolean;
  guestHasEmail: boolean;
}) {
  const canSend = emailEnabled && guestHasEmail;
  return (
    <div>
      {!emailEnabled && (
        <p className={`${styles.small} ${styles.muted}`}>
          Guest email is off (GUEST_EMAIL_FROM unset) — cadence is read-only.
        </p>
      )}
      {emailEnabled && !guestHasEmail && (
        <p className={`${styles.small} ${styles.muted}`}>
          No email on file — capture one (perk claim, intake) and the cadence
          opens up.
        </p>
      )}
      {rows.map((row) => (
        <TouchRow key={row.kind} stayId={stayId} row={row} canSend={canSend} />
      ))}
    </div>
  );
}
