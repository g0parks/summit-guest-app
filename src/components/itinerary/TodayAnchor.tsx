"use client";

import { useEffect } from "react";

/**
 * Mid-stay, the itinerary opens on today — not on the arrival day three
 * screens up. A tiny mount-time scroll to the day group the server marked;
 * prefers-reduced-motion gets an instant jump instead of the glide.
 */
export default function TodayAnchor({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [targetId]);
  return null;
}
