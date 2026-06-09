import Link from "next/link";
import { requireStay } from "@/lib/session";
import { getActiveServices } from "@/lib/queries";
import { formatPriceLabel } from "@/lib/money";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/catalog";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Service = Awaited<ReturnType<typeof getActiveServices>>[number];

export default async function ServicesPage() {
  const { stay } = await requireStay();
  const services = await getActiveServices();

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: services.filter((s) => s.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <main className={styles.page}>
      <header className={`${styles.head} reveal reveal-1`}>
        <h1 className={styles.title}>Concierge</h1>
        <p className={styles.sub}>Anything you need — arranged, on one tab.</p>
      </header>

      {byCategory.map((group, gi) => (
        <section key={group.cat} className={`${styles.section} reveal reveal-${Math.min(gi + 2, 5)}`}>
          <h2 className={styles.sectionLabel}>{CATEGORY_LABEL[group.cat]}</h2>
          <ul className={styles.list}>
            {group.items.map((service: Service) => (
              <li key={service.id}>
                <Link href={`/services/${service.slug}`} className={styles.card}>
                  <div className={styles.cardBody}>
                    <h3 className={styles.cardName}>{service.name}</h3>
                    <p className={styles.cardDesc}>{service.shortDesc}</p>
                    <p className={styles.cardPrice}>
                      {formatPriceLabel(
                        service.priceAmount,
                        service.priceUnit,
                        service.priceNote,
                        stay.currency,
                      )}
                    </p>
                  </div>
                  <svg className={styles.chevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
