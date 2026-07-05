import { prisma } from "@/lib/db";
import { parseUnsubscribeToken } from "@/lib/consent";
import UnsubscribeConfirm from "@/components/consent/UnsubscribeConfirm";
import styles from "./unsubscribe.module.css";

export const metadata = { title: "Summit", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Email unsubscribe — tokened, sessionless (the email itself is the auth).
 * A GET never mutates: link-prefetching scanners land here harmlessly; the
 * opt-out happens on the human's confirm tap (or the one-click POST at
 * /api/unsubscribe for inbox providers). Milk-not-meat: leaving is trivial,
 * no guilt copy, no retention tricks.
 */
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const guestId = parseUnsubscribeToken(decodeURIComponent(token));
  const guest = guestId
    ? await prisma.guest.findUnique({
        where: { id: guestId },
        select: { email: true, emailOptOutAt: true },
      })
    : null;

  if (!guest?.email) {
    return (
      <main className={styles.wrap}>
        <div className={`${styles.inner} reveal reveal-2`}>
          <span className={styles.wordmark}>SUMMIT</span>
          <h1 className={styles.title}>This link isn&rsquo;t active.</h1>
          <p className={styles.body}>
            It may have been copied incompletely. Nothing has changed.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.wrap}>
      <div className={`${styles.inner} reveal reveal-2`}>
        <span className={styles.wordmark}>SUMMIT</span>
        {guest.emailOptOutAt ? (
          <>
            <h1 className={styles.title}>Already done.</h1>
            <p className={styles.body}>
              {guest.email} is unsubscribed. We won&rsquo;t email you.
            </p>
          </>
        ) : (
          <UnsubscribeConfirm token={decodeURIComponent(token)} email={guest.email} />
        )}
      </div>
    </main>
  );
}
