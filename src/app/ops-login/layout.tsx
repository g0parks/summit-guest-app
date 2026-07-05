import type { Metadata } from "next";

// The login page itself is a client component; metadata rides its layout.
// noindex: the ops door works fine unadvertised.
export const metadata: Metadata = {
  title: "Summit Ops",
  robots: { index: false, follow: false },
};

export default function OpsLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
