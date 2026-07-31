import type { Metadata } from "next";
import Link from "next/link";
import { requireOperator } from "@/lib/opsSession";
import { paymentsHealth } from "@/lib/payments";
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

  // Payments health is a DETECTION surface: nobody reads Vercel logs, so a
  // misconfigured Stripe (or a deliberate kill switch) has to be visible the
  // moment you open ops — real stays can't collect a card in either state, and
  // guests are being handed to the concierge line instead.
  const payments = paymentsHealth();

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
      {!payments.ok && (
        <div className={styles.alertBar} role="alert">
          {payments.reason === "misconfigured" ? (
            <>
              <strong>Stripe is misconfigured</strong> — real cards cannot be saved or
              charged. Check STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
              Guests are being sent to the concierge line; demo stays are unaffected.
            </>
          ) : (
            <>
              <strong>Payments are switched off</strong> (PAYMENTS_PROVIDER) — real stays
              can&rsquo;t add a card and charges will refuse. Demo stays are unaffected.
            </>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
