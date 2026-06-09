import styles from "./invalid.module.css";

export const metadata = {
  title: "Summit",
};

export default function InvalidLink() {
  return (
    <main className={styles.wrap}>
      <div className={`${styles.inner} reveal reveal-2`}>
        <span className={styles.wordmark}>SUMMIT</span>
        <h1 className={styles.title}>This link isn&rsquo;t active.</h1>
        <p className={styles.body}>
          Your personal trip link may have expired, or this address isn&rsquo;t quite
          right. Please open the most recent link from your arrival message.
        </p>
        <p className={styles.help}>
          Need a hand? Reach your Summit concierge and we&rsquo;ll send a fresh link.
        </p>
      </div>
    </main>
  );
}
