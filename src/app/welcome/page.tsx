import { redirect } from "next/navigation";
import { getActiveStay } from "@/lib/session";
import { resolveBrand, brandCssVars } from "@/lib/branding";
import { getStayPhase } from "@/lib/stayPhase";
import { enterTrip } from "@/app/actions/welcome";
import styles from "./welcome.module.css";

// The first-visit threshold. The token route redirects a fresh, bare entry
// here (once per stay) before the app home; "Step inside" stamps welcomeSeenAt
// and enters. Lives OUTSIDE the (trip) group on purpose — no bottom nav, a
// full-screen first impression. Co-brand quiet; the aesthetic carries the
// "better taste" signal, the words just scope it to the essentials.
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const active = await getActiveStay();
  if (!active) redirect("/invalid");
  // Already crossed (bookmark / back button) — don't re-show the threshold.
  if (active.stay.welcomeSeenAt) redirect("/");

  const { stay } = active;
  const brand = resolveBrand(stay.property);
  const firstName = stay.guest.firstName?.trim();
  const location = stay.property.city?.trim();
  const phase = getStayPhase(stay, stay.property.timezone);

  const loc = location ? `${location} ` : "";
  // Orienting, not selling — pre-arrival looks ahead, in-stay just states it.
  const stayLabel = phase === "PRE_ARRIVAL" ? `your upcoming ${loc}stay` : `your ${loc}stay`;

  return (
    <main
      className={styles.page}
      style={brandCssVars(brand) as React.CSSProperties | undefined}
    >
      <header className={`${styles.lockup} reveal reveal-1`}>
        {brand.poweredBy ? (
          <>
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.label} className={styles.brandLogo} />
            ) : (
              <span className={styles.brandLabel}>{brand.label}</span>
            )}
            <span className={styles.poweredBy}>powered by Summit</span>
          </>
        ) : (
          <span className={styles.wordmark}>SUMMIT</span>
        )}
      </header>

      <div className={styles.center}>
        <h1 className={`${styles.greeting} reveal reveal-2`}>
          {firstName ? `Welcome, ${firstName}.` : "Welcome."}
        </h1>
        <p className={`${styles.line} reveal reveal-3`}>
          This is where the essentials of {stayLabel} are coordinated — the car,
          the kitchen, the gear, all in one place.
        </p>
        <form action={enterTrip} className="reveal reveal-4">
          <button type="submit" className={styles.cta}>
            Step inside <span aria-hidden>→</span>
          </button>
        </form>
      </div>
    </main>
  );
}
