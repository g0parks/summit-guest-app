import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStay } from "@/lib/session";
import { getOpenRequests, getServiceBySlug } from "@/lib/queries";
import { formatPriceLabel } from "@/lib/money";
import { CATEGORY_LABEL } from "@/lib/catalog";
import { generalMessage, getConciergeContact } from "@/lib/concierge";
import { getStayPhase } from "@/lib/stayPhase";
import ConciergeLinks from "@/components/concierge/ConciergeLinks";
import ArrangeButton from "@/components/services/ArrangeButton";
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

  const concierge = getConciergeContact();
  const postStay = getStayPhase(stay, stay.property.timezone) === "POST_STAY";

  // An open request for this service resumes instead of stacking a duplicate
  // — the signal already exists; the wizard picks it back up.
  const openRequest = postStay
    ? null
    : (await getOpenRequests(stay.id)).find((r) => r.serviceId === service.id) ?? null;

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
        <p className={styles.lead}>
          {postStay ? leadLabel : `${leadLabel} · billed to your tab`}
        </p>
      </section>

      {postStay ? (
        /* the warm close-down: the catalog is a brochure now, but the line
           never closes — the concierge block replaces the request form */
        <section className={`${styles.formWrap} reveal reveal-4`}>
          <p className={styles.desc}>
            Your stay has wrapped — we&rsquo;d love to arrange this for your
            next one.
          </p>
          {(concierge.phone || concierge.email) && (
            <ConciergeLinks
              phone={concierge.phone}
              email={concierge.email}
              message={generalMessage({
                guestFirstName: stay.guest.firstName,
                propertyName: stay.property.name,
              })}
              variant="card"
              smsLabel="Text your concierge"
              emailLabel="Email your concierge"
            />
          )}
        </section>
      ) : (
        <>
          <section className={`${styles.formWrap} reveal reveal-4`}>
            {openRequest ? (
              <div className={styles.resume}>
                <p className={styles.resumeNote}>
                  {openRequest.status === "SIGNALED"
                    ? "You started arranging this — a few details and it's done."
                    : "This one's with your concierge — being arranged."}
                </p>
                <Link href={`/requests/${openRequest.id}`} className={styles.resumeCta}>
                  {openRequest.status === "SIGNALED" ? "Pick it back up" : "View it"}
                </Link>
              </div>
            ) : (
              <ArrangeButton serviceId={service.id} />
            )}
          </section>

          {(concierge.phone || concierge.email) && (
            <p className={`${styles.askFirst} reveal reveal-5`}>
              Prefer to ask first?{" "}
              <ConciergeLinks
                phone={concierge.phone}
                email={concierge.email}
                message={generalMessage({
                  guestFirstName: stay.guest.firstName,
                  propertyName: stay.property.name,
                })}
                variant="inline"
                smsLabel="Text your concierge"
                emailLabel="Email your concierge"
              />
            </p>
          )}
        </>
      )}
    </main>
  );
}
