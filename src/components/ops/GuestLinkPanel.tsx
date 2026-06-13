"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { detectSmsPlatform, smsDeepLink, type SmsPlatform } from "@/lib/smsLink";
import styles from "@/app/ops/ops.module.css";

/**
 * The created/converted stay panel: the guest link (re-derived server-side on
 * every render — nothing secret is stored), a prefilled sms: deep link to the
 * GUEST's phone when we have one, and a copy button as the last resort.
 *
 * Platform-aware sms body syntax + hydration guard live in src/lib/smsLink.ts
 * (shared with the ops Nudge button): UA is unknown at SSR, so the first
 * render uses a bare sms: href and the body resolves after mount.
 */

function CopyLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={styles.btnGhost}
      onClick={() => {
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          })
          .catch(() => {});
      }}
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export default function GuestLinkPanel({
  heading,
  stayId,
  guestLink,
  guestPhone,
  smsMessage,
  emailLine,
}: {
  heading: string;
  stayId: string;
  guestLink: string;
  guestPhone: string | null;
  smsMessage: string;
  /** Honest welcome-email status; null = no line (e.g. revisiting later). */
  emailLine: string | null;
}) {
  const [platform, setPlatform] = useState<SmsPlatform | null>(null);
  useEffect(() => {
    setPlatform(detectSmsPlatform());
  }, []);

  const sms = guestPhone ? smsDeepLink(guestPhone, smsMessage, platform) : null;

  return (
    <div className={styles.requestCard}>
      <div className={styles.requestHead}>
        <span className={styles.requestTitle}>{heading}</span>
        <span className={`${styles.badge} ${styles.badgeOk}`}>LIVE</span>
      </div>
      <p className={styles.small}>
        The guest&rsquo;s personal trip link — send it however feels right:
      </p>
      <code className={styles.guestLink}>{guestLink}</code>
      {emailLine && <p className={styles.small}>{emailLine}</p>}
      <div className={styles.actionsRow}>
        {sms && (
          <a href={sms} className={styles.btnLink}>
            Text it to the guest
          </a>
        )}
        <CopyLinkButton value={guestLink} />
        <Link href={`/ops/stays/${stayId}`} className={styles.link}>
          open stay
        </Link>
      </div>
    </div>
  );
}
