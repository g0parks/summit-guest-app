import type { Metadata } from "next";
import Link from "next/link";
import { requireOperator } from "@/lib/opsSession";
import styles from "./ops.module.css";

export const metadata: Metadata = {
  title: "Summit Ops",
  robots: { index: false, follow: false },
};

/**
 * Internal operator console. Own route group on purpose — no guest layout,
 * no BottomNav, none of the guest app's luxury register. The whole subtree
 * is gated here; every server action re-checks on top.
 */
export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOperator();

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/ops" className={styles.brand}>
          SUMMIT OPS
        </Link>
        <span className={styles.topbarNote}>
          <Link href="/ops" className={styles.link}>
            queues
          </Link>
          {" · "}
          <Link href="/ops/book" className={styles.link}>
            the book
          </Link>
          {" · internal"}
        </span>
      </header>
      {children}
    </div>
  );
}
