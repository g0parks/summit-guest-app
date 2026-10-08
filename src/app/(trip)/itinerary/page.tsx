import Link from "next/link";
import { requireStay } from "@/lib/session";
import { getItinerary, getOpenRequests } from "@/lib/queries";
import TodayAnchor from "@/components/itinerary/TodayAnchor";
import {
  dayKey,
  formatDateRange,
  formatDayLabel,
  formatMonthDay,
  formatTime,
  relativeDayWord,
} from "@/lib/dates";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Item = Awaited<ReturnType<typeof getItinerary>>[number];

export default async function ItineraryPage() {
  const { stay } = await requireStay();
  const tz = stay.property.timezone;
  // Confirmed/dated items live on the timeline; SIGNALED/READY/QUOTED intents
  // aren't scheduled yet — surfaced below so /plan's "on your itinerary"
  // promise holds the moment a guest signals, not only once it's booked.
  const [items, openRequests] = await Promise.all([
    getItinerary(stay.id),
    getOpenRequests(stay.id),
  ]);
  const now = Date.now();

  // First still-upcoming item — gets the accent treatment.
  const nextId = items.find((it) => it.startsAt.getTime() >= now)?.id;

  // Group chronologically by calendar day (in the property's tz).
  const groups: { key: string; date: Date; items: Item[] }[] = [];
  for (const it of items) {
    const key = dayKey(it.startsAt, tz);
    const existing = groups.find((g) => g.key === key);
    if (existing) existing.items.push(it);
    else groups.push({ key, date: it.startsAt, items: [it] });
  }

  // Mid-stay, land on today — only worth a scroll when days sit above it.
  const todayKey = dayKey(new Date(), tz);
  const todayIdx = groups.findIndex((g) => g.key === todayKey);
  const anchorId = todayIdx > 0 ? `day-${todayKey}` : null;

  return (
    <main className={styles.page}>
      {anchorId && <TodayAnchor targetId={anchorId} />}
      <header className={`${styles.head} reveal reveal-1`}>
        <h1 className={styles.title}>Itinerary</h1>
        <p className={styles.sub}>
          {stay.property.name} · {formatDateRange(stay.arrivalDate, stay.departureDate, tz)}
        </p>
      </header>

      {groups.map((group, gi) => (
        <section
          key={group.key}
          id={`day-${group.key}`}
          className={`${styles.day} reveal reveal-${Math.min(gi + 2, 5)}`}
        >
          <div className={styles.dayHead}>
            <span className={styles.dayWord}>{relativeDayWord(group.date, tz)}</span>
            {/* "Today · Tue, Sep 29" keeps the weekday; "Tuesday" already said it. */}
            <span className={styles.dayDate}>
              {["Today", "Tomorrow"].includes(relativeDayWord(group.date, tz))
                ? formatDayLabel(group.date, tz)
                : formatMonthDay(group.date, tz)}
            </span>
          </div>

          <ol className={styles.timeline}>
            {group.items.map((it) => {
              const isNext = it.id === nextId;
              const isPast = it.startsAt.getTime() < now && !isNext;
              const cls = [styles.item, isPast ? styles.past : "", isNext ? styles.next : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={it.id} className={cls}>
                  <span className={styles.dot} aria-hidden="true" />
                  <div className={styles.itemMeta}>
                    <span className={`${styles.time} tabular`}>
                      {it.allDay ? "All day" : formatTime(it.startsAt, tz)}
                    </span>
                    {isNext && <span className={styles.nextTag}>Next</span>}
                    {it.changePending && (
                      <span className={styles.changeChip}>Being rearranged</span>
                    )}
                  </div>
                  <h2 className={styles.itemTitle}>{it.title}</h2>
                  {it.description && <p className={styles.itemDesc}>{it.description}</p>}
                  {it.location && <p className={styles.itemLoc}>{it.location}</p>}
                  {/* The structured change door (Channel Doctrine) — upcoming
                      items only; an in-motion item already says so. */}
                  {!isPast && !it.changePending && (
                    <p className={styles.itemAsk}>
                      <Link href={`/itinerary/${it.id}/change`} className={styles.askLink}>
                        Request a change
                      </Link>
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {/* Intents in motion — signaled but not yet scheduled. Quiet, below the
          dated timeline; graduates onto it when the concierge confirms. */}
      {openRequests.length > 0 && (
        <section className={`${styles.day} reveal reveal-5`}>
          <div className={styles.dayHead}>
            <span className={styles.dayWord}>Being arranged</span>
            <span className={styles.dayDate}>not yet scheduled</span>
          </div>
          <ol className={styles.timeline}>
            {openRequests.map((req) => {
              const cta =
                req.status === "SIGNALED"
                  ? "Add details"
                  : req.status === "QUOTED" && req.quotedAmount
                    ? "Review & approve"
                    : "View";
              return (
                <li key={req.id} className={styles.item}>
                  <span className={styles.dot} aria-hidden="true" />
                  <h2 className={styles.itemTitle}>
                    {req.service?.name ?? req.customTitle ?? "Your request"}
                  </h2>
                  <p className={styles.itemDesc}>
                    {req.status === "QUOTED" && req.quotedAmount
                      ? "Priced and ready for your okay"
                      : "Your concierge is arranging this"}
                  </p>
                  <p className={styles.itemAsk}>
                    <Link href={`/requests/${req.id}`} className={styles.askLink}>
                      {cta}
                    </Link>
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {items.length === 0 && openRequests.length === 0 && (
        <p className={`${styles.empty} reveal reveal-2`}>
          Your itinerary is taking shape. As you plan, everything you arrange
          shows up here.
        </p>
      )}
    </main>
  );
}
