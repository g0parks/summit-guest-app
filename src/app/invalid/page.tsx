import { getConciergeContact, invalidLinkMessage } from "@/lib/concierge";
import ConciergeLinks from "@/components/concierge/ConciergeLinks";
import styles from "./invalid.module.css";

export const metadata = {
  title: "Summit",
  robots: { index: false, follow: false },
};

export default function InvalidLink() {
  // No stay context here — generic Summit voice, no brand guessing.
  const concierge = getConciergeContact();
  const conciergeLive = Boolean(concierge.phone || concierge.email);

  return (
    <main className={styles.wrap}>
      <div className={`${styles.inner} reveal reveal-2`}>
        <span className={styles.wordmark}>SUMMIT</span>
        <h1 className={styles.title}>This link isn&rsquo;t active.</h1>
        <p className={styles.body}>
          Your personal trip link may have expired, or this address isn&rsquo;t quite
          right. Please open the most recent link from your arrival message.
        </p>
        {conciergeLive ? (
          <>
            <p className={styles.help}>
              Need a hand? {concierge.phone ? "Text" : "Email"} your Summit concierge
              and we&rsquo;ll send a fresh link.
            </p>
            <ConciergeLinks
              phone={concierge.phone}
              email={concierge.email}
              message={invalidLinkMessage()}
              variant="card"
              smsLabel="Text your concierge"
              emailLabel="Email your concierge"
            />
          </>
        ) : (
          <p className={styles.help}>
            Need a hand? Reach your Summit concierge and we&rsquo;ll send a fresh link.
          </p>
        )}
      </div>
    </main>
  );
}
