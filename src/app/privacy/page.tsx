import styles from "./privacy.module.css";

export const metadata = {
  title: "Privacy · Summit Luxury Logistics",
  description:
    "How Summit Luxury Logistics handles guest information: what we collect, how it's used to run your stay, and the choices you have.",
};

/**
 * The privacy policy — public, Summit-voiced (Summit operates the service;
 * the co-brand is disclosed as "powered by Summit"). Written to match what
 * the product ACTUALLY does — collect for fulfillment, never sell, honest
 * opt-outs — and nothing it doesn't. Milk-not-meat applies to legal pages
 * too: if a line only works when the guest doesn't read it, it's wrong.
 * Plain English over boilerplate; counsel pass before scale.
 */
export default function PrivacyPage() {
  return (
    <main className={styles.wrap}>
      <article className={styles.inner}>
        <span className={styles.wordmark}>SUMMIT</span>
        <h1 className={styles.title}>Privacy</h1>
        <p className={styles.updated}>Effective July 4, 2026</p>

        <p className={styles.body}>
          Summit Luxury Logistics LLC (&ldquo;Summit&rdquo;) operates concierge
          services for guests of participating vacation-rental property
          managers, sometimes presented under the property manager&rsquo;s own
          brand and noted as &ldquo;powered by Summit.&rdquo; This page explains
          what information we handle and the choices you have. It is written to
          be read.
        </p>

        <h2 className={styles.heading}>What we collect</h2>
        <p className={styles.body}>
          The details needed to run your stay: your name and contact
          information (email, phone), your stay dates and property, the
          requests you make and the preferences that come with them (party
          size, sizing for rentals, dietary notes), and your communication
          choices, including a record of when you agree to receive texts. If
          you reach out through our marketing pages, we keep the contact
          details you choose to leave.
        </p>

        <h2 className={styles.heading}>How we use it</h2>
        <p className={styles.body}>
          To operate your stay and nothing else: arranging the services you
          request with the local providers who fulfill them, coordinating
          timing and delivery, keeping your running tab accurate, and sending
          you messages about your own trip. We share details with a provider
          only as needed to fulfill your request (a driver needs your flight
          time; a rental shop needs sizes), and with your property manager as
          part of hosting you.
        </p>

        <h2 className={styles.heading}>What we never do</h2>
        <p className={styles.body}>
          We do not sell your information. We do not rent lists or run outside
          advertising with your data. We do not send marketing texts without
          your explicit opt-in, and we do not buy or trade reviews.
        </p>

        <h2 className={styles.heading}>Email and texts</h2>
        <p className={styles.body}>
          Emails about your stay include an unsubscribe link, and one tap ends
          them, permanently. Texts are sent only after you opt in, only about
          your stay, and you can stop them at any time. Consent records are
          kept so your choices are honored.
        </p>

        <h2 className={styles.heading}>Where it lives</h2>
        <p className={styles.body}>
          Your information is stored in access-controlled databases hosted in
          the United States. Your trip page is reached only through a private,
          signed link, with no account or password to leak.
        </p>

        <h2 className={styles.heading}>Your choices</h2>
        <p className={styles.body}>
          Ask us what we hold about you, ask us to correct it, or ask us to
          delete it, and we will, unless a record must be kept (for example,
          proof of a consent choice or a completed transaction). Write to{" "}
          <a className={styles.link} href="mailto:info@summitluxurylogistics.com">
            info@summitluxurylogistics.com
          </a>
          .
        </p>

        <h2 className={styles.heading}>Contact</h2>
        <p className={styles.body}>
          Summit Luxury Logistics LLC · 7533 S Center View Ct, Ste N · West
          Jordan, UT 84084 ·{" "}
          <a className={styles.link} href="mailto:info@summitluxurylogistics.com">
            info@summitluxurylogistics.com
          </a>{" "}
          · (435) 214-4101
        </p>

        <p className={styles.note}>
          If this page changes in a way that matters, the effective date above
          changes with it.
        </p>
      </article>
    </main>
  );
}
