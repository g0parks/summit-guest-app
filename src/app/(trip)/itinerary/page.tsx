import { requireStay } from "@/lib/session";
import { getItinerary } from "@/lib/queries";
import {
  dayKey,
  formatDateRange,
  formatDayLabel,
  formatTime,
  relativeDayWord,
} from "@/lib/dates";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Item = Awaited<ReturnType<typeof getItinerary>>[number];

export default async function ItineraryPage() {
  const { stay } = await requireStay();
  const tz = stay.property.timezone;
  const items = await getItinerary(stay.id);
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

  return (
    <main className={styles.page}>
      <header className={`${styles.head} reveal reveal-1`}>
        <h1 className={styles.title}>Itinerary</h1>
        <p className={styles.sub}>
          {stay.property.name} · {formatDateRange(stay.arrivalDate, stay.departureDate, tz)}
        </p>
      </header>

      {groups.map((group, gi) => (
        <section key={group.key} className={`${styles.day} reveal reveal-${Math.min(gi + 2, 5)}`}>
          <div className={styles.dayHead}>
            <span className={styles.dayWord}>{relativeDayWord(group.date, tz)}</span>
            <span className={styles.dayDate}>{formatDayLabel(group.date, tz)}</span>
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
                  </div>
                  <h2 className={styles.itemTitle}>{it.title}</h2>
                  {it.description && <p className={styles.itemDesc}>{it.description}</p>}
                  {it.location && <p className={styles.itemLoc}>{it.location}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </main>
  );
}
