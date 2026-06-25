"use client";

import { useActionState } from "react";
import Link from "next/link";
import { claimPerk, type ClaimResult } from "@/app/actions/perks";
import styles from "./ClaimForm.module.css";

/**
 * The gift moment. Minimal on purpose — name (read-only), a way to reach you,
 * one quiet opt-in. It should feel like accepting a gift, not filling a form.
 */
export default function ClaimForm({
  perkId,
  guestFirstName,
  defaultEmail,
  defaultPhone,
  alreadyClaimed,
}: {
  perkId: string;
  guestFirstName: string;
  defaultEmail: string | null;
  defaultPhone: string | null;
  alreadyClaimed: boolean;
}) {
  const [state, action, pending] = useActionState<ClaimResult | null, FormData>(
    claimPerk,
    null,
  );

  // Fresh claim → warm confirmation. This stays mounted across the
  // post-action RSC refresh (alreadyClaimed flips true), so check local
  // success state FIRST — the claimer keeps their moment.
  if (state?.ok) {
    return (
      <div className={styles.done}>
        <span className={styles.check} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </span>
        <h2 className={styles.doneTitle}>Consider it arranged.</h2>
        <p className={styles.doneBody}>
          We&rsquo;ll be in touch to schedule. Nothing else for you to do.
        </p>
        <div className={styles.doneActions}>
          <Link href="/perks" className={styles.secondaryLink}>
            Back to your perks
          </Link>
        </div>
      </div>
    );
  }

  // Returning to a perk this stay already claimed → quiet settled state.
  if (alreadyClaimed) {
    return (
      <div className={styles.done}>
        <span className={styles.check} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </span>
        <h2 className={styles.doneTitle}>Already arranged.</h2>
        <p className={styles.doneBody}>
          Claimed for your stay. We&rsquo;ll be in touch to schedule.
        </p>
        <div className={styles.doneActions}>
          <Link href="/perks" className={styles.secondaryLink}>
            Back to your perks
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="perkId" value={perkId} />

      <label className={styles.field}>
        <span className={styles.label}>Name</span>
        <input
          type="text"
          value={guestFirstName}
          readOnly
          className={`${styles.input} ${styles.readonly}`}
          aria-label="Your first name"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Email</span>
        <input
          type="email"
          name="email"
          defaultValue={defaultEmail ?? ""}
          autoComplete="email"
          inputMode="email"
          className={styles.input}
          placeholder="you@example.com"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>
          Phone <span className={styles.optional}>or email, whichever you prefer</span>
        </span>
        <input
          type="tel"
          name="phone"
          defaultValue={defaultPhone ?? ""}
          autoComplete="tel"
          inputMode="tel"
          className={styles.input}
          placeholder="(435) 555-0100"
        />
      </label>

      <label className={styles.optIn}>
        <input type="checkbox" name="optIn" className={styles.checkbox} />
        <span>Keep me in touch for future stays</span>
      </label>

      {state && !state.ok && <p className={styles.error}>{state.error}</p>}

      <button type="submit" disabled={pending} className={styles.submit}>
        {pending ? "One moment…" : "Claim with our compliments"}
      </button>

      <p className={styles.note}>This one&rsquo;s on us.</p>
    </form>
  );
}
