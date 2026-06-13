"use client";

import { useState } from "react";
import styles from "@/app/ops/ops.module.css";

/** Copy-to-clipboard for operator artifacts (PM recaps, drafts). */
export default function CopyTextButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
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
      {copied ? "Copied" : label}
    </button>
  );
}
