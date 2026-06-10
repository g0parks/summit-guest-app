import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStay } from "@/lib/session";
import { getServiceBySlug } from "@/lib/queries";
import { formatPriceLabel } from "@/lib/money";
import { CATEGORY_LABEL } from "@/lib/catalog";
import { serviceFormConfig } from "@/lib/serviceForm";
import RequestForm from "@/components/services/RequestForm";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function ServiceDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { stay } = await requireStay();
  const service = await getServiceBySlug(slug);
  if (!service || !service.isActive) notFound();

  const leadDays = Math.round(service.leadTimeHours / 24);
  const leadLabel =
    service.leadTimeHours >= 24
      ? `${leadDays} day${leadDays === 1 ? "" : "s"} notice`
      : `${service.leadTimeHours}h notice`;

  return (
    <main className={styles.page}>
      <Link href="/services" className={`${styles.back} reveal reveal-1`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Concierge
      </Link>

      <header className={`${styles.head} reveal reveal-2`}>
        <span className="eyebrow">{CATEGORY_LABEL[service.category]}</span>
        <h1 className={styles.title}>{service.name}</h1>
        <p className={styles.price}>
          {formatPriceLabel(
            service.priceAmount,
            service.priceUnit,
            service.priceNote,
            stay.currency,
          )}
        </p>
      </header>

      <section className={`${styles.body} reveal reveal-3`}>
        <p className={styles.desc}>{service.longDesc ?? service.shortDesc}</p>
        <p className={styles.lead}>{leadLabel} · billed to your tab</p>
      </section>

      <section className={`${styles.formWrap} reveal reveal-4`}>
        <RequestForm
          service={{
            id: service.id,
            name: service.name,
            priceUnit: service.priceUnit,
            priceAmount: service.priceAmount,
            requiresDate: service.requiresDate,
            requiresTime: service.requiresTime,
            requiresPartySize: service.requiresPartySize,
          }}
          fields={serviceFormConfig(service.slug).fields}
          notesPlaceholder={serviceFormConfig(service.slug).notesPlaceholder}
          defaultPartySize={stay.partySize ?? 2}
          currency={stay.currency}
        />
      </section>
    </main>
  );
}
