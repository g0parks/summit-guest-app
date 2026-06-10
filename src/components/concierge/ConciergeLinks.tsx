"use client";

import { useEffect, useState } from "react";
import styles from "./ConciergeLinks.module.css";

/**
 * Platform-aware concierge contact links. Server components resolve contact
 * (env) + prebuild the message; this component only decides hrefs.
 *
 * The `sms:` body syntax differs per platform:
 *   iOS  → sms:<phone>&body=...
 *   Android → sms:<phone>?body=...
 *   Mac  → sms:<phone>&body=... (Messages.app; body prefill best-effort)
 *   Desktop/unknown → NO sms link: number as text + tap-to-copy + mailto.
 *
 * Hydration guard: UA is unknown at SSR, so the first render (server AND
 * client) uses a stable platform-less shell; the platform-specific hrefs
 * resolve after mount via state. No hydration mismatches.
 *
 * Null phone → text/call CTAs not rendered, email only. Null both → renders
 * nothing (callers also hide their framing copy, so surfaces look
 * intentional, never broken).
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
  if (platform === "other") return null;
  // Pre-mount (null): bare recipient works everywhere; body resolves on mount.
  if (platform === null) return `sms:${phone}`;
  const body = encodeURIComponent(message);
  return platform === "android"
    ? `sms:${phone}?body=${body}`
    : `sms:${phone}&body=${body}`;
}

function mailtoHref(email: string, subject: string, message: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

/** "+14355550100" → "+1 (435) 555-0100" for display; non-US E.164 passes through. */
function displayPhone(phone: string): string {
  const m = phone.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : phone;
}

function CopyNumberButton({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={styles.copyBtn}
      onClick={() => {
        navigator.clipboard
          .writeText(phone)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          })
          .catch(() => {});
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function ConciergeLinks({
  phone,
  email,
  message,
  variant,
  smsLabel,
  emailLabel,
  emailSubject = "Your concierge",
}: {
  phone: string | null;
  email: string | null;
  message: string;
  variant: "card" | "inline";
  smsLabel: string;
  emailLabel: string;
  emailSubject?: string;
}) {
  // null until mounted — SSR and first client render stay identical.
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  if (!phone && !email) return null;

  const sms = phone ? smsHref(phone, message, platform) : null;
  const mail = email ? mailtoHref(email, emailSubject, message) : null;

  if (variant === "inline") {
    // One quiet link. Mobile/Mac: sms. Desktop (or no phone): mailto, with
    // the number alongside as copyable text when a phone exists.
    if (sms) {
      return (
        <a href={sms} className={styles.inlineLink}>
          {smsLabel}
        </a>
      );
    }
    return (
      <span className={styles.inlineWrap}>
        {mail && (
          <a href={mail} className={styles.inlineLink}>
            {emailLabel}
          </a>
        )}
        {phone && (
          <>
            {mail && <span className={styles.inlineSep}> · </span>}
            <span className={styles.inlineNumber}>{displayPhone(phone)}</span>{" "}
            <CopyNumberButton phone={phone} />
          </>
        )}
      </span>
    );
  }

  // card — the full contact cluster: one primary action, quiet secondaries.
  return (
    <div className={styles.cardActions}>
      {sms ? (
        <a href={sms} className={styles.primary}>
          {smsLabel}
        </a>
      ) : phone ? (
        // Desktop with a phone: the number IS the primary, with copy.
        <div className={styles.numberRow}>
          <span className={styles.number}>{displayPhone(phone)}</span>
          <CopyNumberButton phone={phone} />
        </div>
      ) : mail ? (
        <a href={mail} className={styles.primary}>
          {emailLabel}
        </a>
      ) : null}

      {/* secondaries only make sense when a phone holds the primary slot */}
      {phone && (
        <div className={styles.secondaryRow}>
          {platform !== "other" && (
            <a href={`tel:${phone}`} className={styles.secondaryLink}>
              Call
            </a>
          )}
          {mail && (
            <a href={mail} className={styles.secondaryLink}>
              Email
            </a>
          )}
        </div>
      )}
    </div>
  );
}
