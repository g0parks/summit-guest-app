import { requireOperator } from "@/lib/opsSession";
import { getConvertProperties } from "@/lib/opsQueries";
import { getGuestEmailConfig } from "@/lib/guestEmail";
import StayForm from "@/components/ops/StayForm";
import styles from "../../ops.module.css";

export const dynamic = "force-dynamic";

/**
 * Entry A — PRIMARY stay creation: the PM hands us guest+stay data and the
 * operator keys it here (the future PMS feed calls the same core,
 * src/lib/opsStay.ts). Creates Guest+Stay+token in one transaction and
 * surfaces the guest link.
 */
export default async function NewStayPage() {
  // Page-level gate (layouts aren't a safe sole auth boundary in App Router).
  await requireOperator();

  const properties = await getConvertProperties();
  const emailEnabled = getGuestEmailConfig().enabled;

  return (
    <main>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>New stay</h2>
        <p className={`${styles.small} ${styles.muted}`} style={{ margin: "0 0 10px" }}>
          Guest + stay data from the property manager. Creating the stay mints
          the guest&rsquo;s personal trip link.
        </p>
        <div className={styles.requestCard}>
          <StayForm
            properties={properties.map((p) => ({ id: p.id, name: p.name }))}
            emailEnabled={emailEnabled}
            submitLabel="Create stay & mint link"
          />
        </div>
      </section>
    </main>
  );
}
