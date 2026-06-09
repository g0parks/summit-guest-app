"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./BottomNav.module.css";

type NavKey = "trip" | "itinerary" | "services" | "tab";

const ITEMS: { key: NavKey; label: string; href: string; icon: React.ReactNode }[] = [
  {
    key: "trip",
    label: "Trip",
    href: "/",
    icon: <path d="M2.5 19.5l6-10.5 4 6 3-4.5 6 9z" />,
  },
  {
    key: "itinerary",
    label: "Itinerary",
    href: "/itinerary",
    icon: (
      <>
        <rect x="3.5" y="4.75" width="17" height="15.75" rx="2.5" />
        <path d="M3.5 9.5h17M8.25 3v3.25M15.75 3v3.25" />
      </>
    ),
  },
  {
    key: "services",
    label: "Services",
    href: "/services",
    icon: (
      <>
        <path d="M6 16.5v-4.5a6 6 0 0 1 12 0v4.5l1.5 2.25h-15z" />
        <path d="M10 19.75a2 2 0 0 0 4 0" />
      </>
    ),
  },
  {
    key: "tab",
    label: "Tab",
    href: "/tab",
    icon: (
      <>
        <path d="M6.25 3h11.5v18l-2.3-1.4-2.3 1.4-2.3-1.4-2.3 1.4-2.3-1.4z" />
        <path d="M9.5 8.25h5M9.5 12h5" />
      </>
    ),
  },
];

function activeKey(pathname: string): NavKey {
  if (pathname.startsWith("/services")) return "services";
  if (pathname.startsWith("/itinerary")) return "itinerary";
  if (pathname.startsWith("/tab")) return "tab";
  return "trip";
}

export default function BottomNav() {
  const active = activeKey(usePathname());
  return (
    <nav className={styles.nav} aria-label="Primary">
      <ul className={styles.list}>
        {ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={isActive ? `${styles.item} ${styles.active}` : styles.item}
                aria-current={isActive ? "page" : undefined}
              >
                <svg
                  className={styles.icon}
                  width="23"
                  height="23"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {item.icon}
                </svg>
                <span className={styles.label}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
