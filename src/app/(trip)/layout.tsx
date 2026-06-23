import type { Metadata } from "next";
import BottomNav from "@/components/nav/BottomNav";
import DemoLeadPrompt from "@/components/demo/DemoLeadPrompt";
import { getActiveStay } from "@/lib/session";
import { brandCssVars, resolveBrand } from "@/lib/branding";

// Every page in this group resolves the guest from the session cookie via
// requireStay(); the shared shell adds the persistent bottom nav and, when the
// stay's property has a partner, overrides the accent custom properties so the
// partner theme flows everywhere without per-component changes. No partner →
// no inline style → pixel-identical Summit default.

export async function generateMetadata(): Promise<Metadata> {
  const active = await getActiveStay();
  const brand = resolveBrand(active?.stay.property);
  // Co-branded title where stay context exists; root default otherwise.
  return brand.poweredBy ? { title: brand.label } : {};
}

export default async function TripLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const active = await getActiveStay();
  const brand = resolveBrand(active?.stay.property);

  return (
    <div style={brandCssVars(brand) as React.CSSProperties | undefined}>
      {children}
      <BottomNav />
      {active?.stay.isDemo ? <DemoLeadPrompt /> : null}
    </div>
  );
}
