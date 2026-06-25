import Link from "next/link";
import { requireStay } from "@/lib/session";
import { resolveBrand } from "@/lib/branding";
import { getPerksForStay } from "@/lib/queries";
import { getStayPhase } from "@/lib/stayPhase";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

/**
 * The Perk Bank — framed as a gift from the brand, never as lead-gen.
 * Calm register: "with our compliments", one quiet claimed state.
 */
export default async function PerksPage() {
  const { stay } = await requireStay();
  const brand = resolveBrand(stay.property);
  const postStay = getStayPhase(stay, stay.property.timezone) === "POST_STAY";
  const perks = await getPerksForStay(stay.id, stay.property.partnerId);

  return (
    <main className={styles.page}>
      <header className={`${styles.head} reveal reveal-1`}>
        <h1 className={styles.title}>
          {brand.poweredBy ? `A gift from ${brand.shortName}` : "With our compliments"}
        </h1>
        <p className={styles.sub}>
          {postStay
            ? "Your stay has wrapped. These will be waiting next time."
            : "A few touches arranged for your stay. Claim whichever suit you."}
        </p>
      </header>

      <section className={`${styles.list} reveal reveal-2`}>
        {perks.length === 0 ? (
          <p className={styles.empty}>
            Nothing here just yet. Your concierge will let you know.
          </p>
        ) : (
          <ul className={styles.cards}>
            {perks.map((perk) => {
              const claimed = perk.claims.length > 0;
              return (
                <li key={perk.id}>
                  <Link href={`/perks/${perk.slug}`} className={styles.card}>
                    <div className={styles.cardBody}>
                      <h2 className={styles.cardName}>{perk.name}</h2>
                      {perk.vendorName && (
                        <p className={styles.cardVendor}>with {perk.vendorName}</p>
                      )}
                      <p className={styles.cardDesc}>{perk.shortDesc}</p>
                      {claimed ? (
                        <span className={styles.claimed}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 12.5l4.5 4.5L19 7" />
                          </svg>
                          Claimed
                        </span>
                      ) : postStay ? (
                        // warm close-down: the claim CTA quietly retires
                        <span className={styles.value}>Your stay has ended</span>
                      ) : (
                        // generosity is the register — no dollar-value framing
                        <span className={styles.value}>Complimentary</span>
                      )}
                    </div>
                    <svg className={styles.chevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className={`${styles.reassure} reveal reveal-3`}>
        Claiming a perk never touches your tab.
      </p>
    </main>
  );
}
