import BottomNav from "@/components/nav/BottomNav";

// Every page in this group resolves the guest from the session cookie via
// requireStay(); the shared shell just adds the persistent bottom nav.
export default function TripLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
