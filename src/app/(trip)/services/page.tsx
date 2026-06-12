import Link from "next/link";
import { requireStay } from "@/lib/session";
import { getActiveServices, getOpenRequests } from "@/lib/queries";
import { formatPriceLabel } from "@/lib/money";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/catalog";
import { getStayPhase, staySeason } from "@/lib/stayPhase";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Service = Awaited<ReturnType<typeof getActiveServices>>[number];

function ServiceCard({ service, currency }: { service: Service; currency: string }) {
  return (
    <Link href={`/services/${service.slug}`} className={styles.card}>
      <div className={styles.cardBody}>
        <h3 className={styles.cardName}>{service.name}</h3>
        <p className={styles.cardDesc}>{service.shortDesc}</p>
        <p className={styles.cardPrice}>
          {formatPriceLabel(
            service.priceAmount,
            service.priceUnit,
            service.priceNote,
            currency,
          )}
        </p>
      </div>
      <svg className={styles.chevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

export default async function ServicesPage() {
  const { stay } = await requireStay();
  const postStay = getStayPhase(stay, stay.property.timezone) === "POST_STAY";
  // The stay's season picks the menu — off-season dishes hidden, not greyed.
  const [services, openRequests] = await Promise.all([
    getActiveServices(staySeason(stay, stay.property.timezone)),
    postStay ? [] : getOpenRequests(stay.id),
  ]);

  // Services already in motion (a signal exists) — a suggestion section, not
  // an upsell; they ALSO remain in their category sections below. The detail
  // page resumes the open request. Post-stay the catalog is a brochure, so
  // the section quietly retires.
  const openServiceIds = new Set(openRequests.map((r) => r.serviceId));
  const planned = services.filter((s) => openServiceIds.has(s.id));

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: services.filter((s) => s.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <main className={styles.page}>
      <header className={`${styles.head} reveal reveal-1`}>
        <h1 className={styles.title}>Concierge</h1>
        <p className={styles.sub}>
          {postStay
            ? "Your stay has wrapped — for next time, just say the word."
            : "Anything you need — arranged, on one tab."}
        </p>
      </header>

      {planned.length > 0 && (
        <section className={`${styles.section} reveal reveal-2`}>
          <h2 className={styles.sectionLabel}>Already in motion</h2>
          <p className={styles.sectionNote}>
            You started these — a few details and they&rsquo;re done.
          </p>
          <ul className={styles.list}>
            {planned.map((service) => (
              <li key={service.id}>
                <ServiceCard service={service} currency={stay.currency} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {byCategory.map((group, gi) => (
        <section key={group.cat} className={`${styles.section} reveal reveal-${Math.min(gi + 2, 5)}`}>
          <h2 className={styles.sectionLabel}>{CATEGORY_LABEL[group.cat]}</h2>
          <ul className={styles.list}>
            {group.items.map((service: Service) => (
              <li key={service.id}>
                <ServiceCard service={service} currency={stay.currency} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
