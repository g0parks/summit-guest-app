"use client";

import { useEffect, useState } from "react";
import { detectSmsPlatform, smsDeepLink, type SmsPlatform } from "@/lib/smsLink";
import styles from "@/app/ops/ops.module.css";

/**
 * The Awaiting-guest queue's one action: a prefilled sms: draft the OPERATOR
 * taps from their own phone (channel doctrine — SMS is Summit-initiated and
 * purposeful; there is NO outbound infra, the operator's thumb sends it).
 * Desktop, or no guest phone → copy the message instead, deep link included.
 */
export default function NudgeButton({
  guestPhone,
  message,
}: {
  guestPhone: string | null;
  message: string;
}) {
  const [platform, setPlatform] = useState<SmsPlatform | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setPlatform(detectSmsPlatform());
  }, []);

  const sms = guestPhone ? smsDeepLink(guestPhone, message, platform) : null;
  if (sms) {
    return (
      <a href={sms} className={styles.btnLink}>
        Nudge
      </a>
    );
  }

  return (
    <button
      type="button"
      className={styles.btnGhost}
      onClick={() => {
        navigator.clipboard
          .writeText(message)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          })
          .catch(() => {});
      }}
    >
      {copied ? "Copied" : "Copy nudge"}
    </button>
  );
}
