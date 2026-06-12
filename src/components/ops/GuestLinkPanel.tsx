"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "@/app/ops/ops.module.css";

/**
 * The created/converted stay panel: the guest link (re-derived server-side on
 * every render — nothing secret is stored), a prefilled sms: deep link to the
 * GUEST's phone when we have one, and a copy button as the last resort.
 *
 * Platform-aware sms body syntax + hydration guard follow ConciergeLinks:
 * UA is unknown at SSR, so the first render uses a bare sms: href and the
 * platform-specific body resolves after mount.
 */

type Platform = "ios" | "android" | "mac" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua)) return "mac";
  return "other";
}

function smsHref(phone: string, message: string, platform: Platform | null): string | null {
  // Operator-typed phones may carry human formatting — make them dialable.
  const dialable = phone.replace(/[^+\d]/g, "");
  if (!dialable) return null;
  if (platform === "other") return null;
  if (platform === null) return `sms:${dialable}`;
  const body = encodeURIComponent(message);
  return platform === "android"
    ? `sms:${dialable}?body=${body}`
    : `sms:${dialable}&body=${body}`;
}

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
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const sms = guestPhone ? smsHref(guestPhone, smsMessage, platform) : null;

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
