import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStay } from "@/lib/session";
import { getPerkBySlug } from "@/lib/queries";
import { getStayPhase } from "@/lib/stayPhase";
import ClaimForm from "@/components/perks/ClaimForm";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function PerkDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { stay } = await requireStay();
  const perk = await getPerkBySlug(slug, stay.id);

  const visible =
    perk &&
    perk.isActive &&
    (perk.partnerId === null || perk.partnerId === stay.property.partnerId);
  if (!perk || !visible) notFound();

  const claimed = perk.claims.length > 0;
  const postStay = getStayPhase(stay, stay.property.timezone) === "POST_STAY";

  return (
    <main className={styles.page}>
      <Link href="/perks" className={`${styles.back} reveal reveal-1`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Your perks
      </Link>

      <header className={`${styles.head} reveal reveal-2`}>
        <span className="eyebrow">With our compliments</span>
        <h1 className={styles.title}>{perk.name}</h1>
        {perk.vendorName && <p className={styles.meta}>with {perk.vendorName}</p>}
      </header>

      <section className={`${styles.body} reveal reveal-3`}>
        <p className={styles.desc}>{perk.longDesc ?? perk.shortDesc}</p>
        <p className={styles.lead}>Complimentary — never touches your tab.</p>
      </section>

      <section className={`${styles.formWrap} reveal reveal-4`}>
        {postStay && !claimed ? (
          /* warm close-down — mirrors the claimPerk server guard */
          <p className={styles.lead}>
            Your stay has wrapped — this one will be waiting with our
            compliments next time.
          </p>
        ) : (
          /* ClaimForm owns the claimed state too — it survives the post-action
             RSC refresh, so a fresh claimer keeps the confirmation moment. */
          <ClaimForm
            perkId={perk.id}
            guestFirstName={stay.guest.firstName}
            defaultEmail={stay.guest.email}
            defaultPhone={stay.guest.phone}
            alreadyClaimed={claimed}
          />
        )}
      </section>
    </main>
  );
}
