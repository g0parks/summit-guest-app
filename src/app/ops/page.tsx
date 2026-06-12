import Link from "next/link";
import {
  getNeedsAction,
  getOpsStays,
  getRecentActivity,
  getRecentIntakes,
} from "@/lib/opsQueries";
import { formatMoney } from "@/lib/money";
import { formatDateRange, formatDayLabel, formatTime } from "@/lib/dates";
import { interestedLabels, parseIntakeAnswers } from "@/lib/intakeFlow";
import styles from "./ops.module.css";

export const dynamic = "force-dynamic";

export default async function OpsOverviewPage() {
  const [{ needsQuote, upcoming, perkClaims }, stays, activity, intakes] =
    await Promise.all([
      getNeedsAction(),
      getOpsStays(),
      getRecentActivity(),
      getRecentIntakes(),
    ]);

  return (
    <main>
      {/* Path A is PRIMARY: PMS-sourced guest data gets keyed here today;
          the future PMS feed calls the same creation core. */}
      <div className={styles.pageActions}>
        <Link href="/ops/stays/new" className={styles.btnLink}>
          + New stay
        </Link>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Needs action</h2>
        {needsQuote.length === 0 && upcoming.length === 0 && perkClaims.length === 0 ? (
          <p className={styles.empty}>Nothing waiting on you.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>What</th>
                <th>Request</th>
                <th>Guest</th>
                <th>When</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {needsQuote.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeAction}`}>
                      NEEDS QUOTE
                    </span>
                  </td>
                  <td>{r.service?.name ?? r.customTitle ?? "Custom request"}</td>
                  <td>
                    {r.stay.guest.firstName} {r.stay.guest.lastName ?? ""}
                    {r.stay.isDemo && (
                      <>
                        {" "}
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>DEMO</span>
                      </>
                    )}
                    <span className={styles.muted}> @ {r.stay.property.name}</span>
                  </td>
                  <td className={styles.small}>
                    {r.requestedFor
                      ? `${formatDayLabel(r.requestedFor, r.stay.property.timezone)} · ${formatTime(r.requestedFor, r.stay.property.timezone)}`
                      : "—"}
                  </td>
                  <td className={styles.small}>{r.notes ?? "—"}</td>
                  <td>
                    <Link href={`/ops/stays/${r.stayId}`} className={styles.link}>
                      open
                    </Link>
                  </td>
                </tr>
              ))}
              {perkClaims.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeAction}`}>
                      PERK CLAIM
                    </span>
                  </td>
                  <td>{c.perk.name}</td>
                  <td>
                    {c.stay.guest.firstName} {c.stay.guest.lastName ?? ""}
                    {c.stay.isDemo && (
                      <>
                        {" "}
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>DEMO</span>
                      </>
                    )}
                    <span className={styles.muted}> @ {c.stay.property.name}</span>
                  </td>
                  <td className={styles.small}>
                    {formatDayLabel(c.createdAt, c.stay.property.timezone)} ·{" "}
                    {formatTime(c.createdAt, c.stay.property.timezone)}
                  </td>
                  <td className={styles.small}>
                    {c.email ?? c.phone ?? "—"}
                    {c.marketingOptIn ? " · opt-in" : ""}
                  </td>
                  <td>
                    <Link href={`/ops/stays/${c.stayId}`} className={styles.link}>
                      open
                    </Link>
                  </td>
                </tr>
              ))}
              {upcoming.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeOk}`}>
                      NEXT 48H
                    </span>
                  </td>
                  <td>{r.service?.name ?? r.customTitle ?? "Custom request"}</td>
                  <td>
                    {r.stay.guest.firstName} {r.stay.guest.lastName ?? ""}
                    {r.stay.isDemo && (
                      <>
                        {" "}
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>DEMO</span>
                      </>
                    )}
                    <span className={styles.muted}> @ {r.stay.property.name}</span>
                  </td>
                  <td className={styles.small}>
                    {r.requestedFor
                      ? `${formatDayLabel(r.requestedFor, r.stay.property.timezone)} · ${formatTime(r.requestedFor, r.stay.property.timezone)}`
                      : "—"}
                  </td>
                  <td className={styles.small}>{r.notes ?? "—"}</td>
                  <td>
                    <Link href={`/ops/stays/${r.stayId}`} className={styles.link}>
                      open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Stays — upcoming &amp; in-house</h2>
        {stays.length === 0 ? (
          <p className={styles.empty}>No current or upcoming stays.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Guest</th>
                <th>Property</th>
                <th>Dates</th>
                <th className={styles.num}>Party</th>
                <th className={styles.num}>Tab pending</th>
                <th className={styles.num}>Tab settled</th>
                <th>Last opened</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stays.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.guest.firstName} {s.guest.lastName ?? ""}
                    {s.isDemo && (
                      <>
                        {" "}
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>DEMO</span>
                      </>
                    )}
                  </td>
                  <td>{s.property.name}</td>
                  <td className={styles.small}>
                    {formatDateRange(s.arrivalDate, s.departureDate, s.property.timezone)}
                  </td>
                  <td className={styles.num}>{s.partySize ?? "—"}</td>
                  <td className={styles.num}>{formatMoney(s.pendingCents, s.currency)}</td>
                  <td className={styles.num}>{formatMoney(s.chargedCents, s.currency)}</td>
                  <td className={styles.small}>
                    {s.lastAccessedAt ? (
                      `${formatDayLabel(s.lastAccessedAt, s.property.timezone)} · ${formatTime(s.lastAccessedAt, s.property.timezone)}`
                    ) : (
                      <span className={styles.muted}>never</span>
                    )}
                  </td>
                  <td>
                    <Link href={`/ops/stays/${s.id}`} className={styles.link}>
                      open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Trip intakes — /plan leads</h2>
        {intakes.length === 0 ? (
          <p className={styles.empty}>No intakes yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Contact</th>
                <th>Trip timing</th>
                <th>Interested in</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {intakes.map((it) => {
                const answers = parseIntakeAnswers(it.answersJson);
                const interests = interestedLabels(answers);
                const priority = interests.length >= 2 || Boolean(it.note);
                return (
                  <tr key={it.id}>
                    <td className={styles.small} style={{ whiteSpace: "nowrap" }}>
                      {formatDayLabel(it.createdAt)} · {formatTime(it.createdAt)}
                      {priority && (
                        <>
                          {" "}
                          <span className={`${styles.badge} ${styles.badgeAction}`}>
                            PRIORITY
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {it.name ?? <span className={styles.muted}>anonymous</span>}
                      {it.stay && (
                        <span className={styles.muted}>
                          {" "}
                          · {it.stay.guest.firstName} @ {it.stay.property.name}
                          {it.stay.isDemo ? " (DEMO)" : ""}
                        </span>
                      )}
                    </td>
                    <td className={styles.small}>
                      {[it.email, it.phone].filter(Boolean).join(" · ") || (
                        <span className={styles.muted}>none left</span>
                      )}
                    </td>
                    <td className={styles.small}>{it.tripTiming ?? "—"}</td>
                    <td className={styles.small}>
                      {interests.length > 0
                        ? interests.map((label) => (
                            <span
                              key={label}
                              className={`${styles.badge} ${styles.badgeOk}`}
                              style={{ marginRight: 4 }}
                            >
                              {label}
                            </span>
                          ))
                        : "—"}
                    </td>
                    <td className={styles.small}>{it.note ?? "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {it.convertedAt ? (
                        <>
                          <span className={`${styles.badge} ${styles.badgeOk}`}>
                            CONVERTED
                          </span>{" "}
                          <Link
                            href={`/ops/intakes/${it.id}`}
                            className={styles.link}
                          >
                            open
                          </Link>
                        </>
                      ) : it.stayId ? (
                        <Link
                          href={`/ops/stays/${it.stayId}`}
                          className={styles.link}
                        >
                          linked — open stay
                        </Link>
                      ) : (
                        <Link
                          href={`/ops/intakes/${it.id}`}
                          className={styles.link}
                        >
                          convert →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recent activity</h2>
        {activity.length === 0 ? (
          <p className={styles.empty}>Quiet so far.</p>
        ) : (
          <table className={styles.table}>
            <tbody>
              {activity.map((a, i) => (
                <tr key={`${a.kind}-${i}`}>
                  <td className={styles.small} style={{ whiteSpace: "nowrap" }}>
                    {formatDayLabel(a.at)} · {formatTime(a.at)}
                  </td>
                  <td>
                    <span
                      className={`${styles.badge} ${a.kind === "charge" ? styles.badgeOk : styles.badgeNeutral}`}
                    >
                      {a.kind === "charge" ? "CHARGED" : "REQUEST"}
                    </span>
                  </td>
                  <td>{a.label}</td>
                  <td>
                    <Link href={`/ops/stays/${a.stayId}`} className={styles.link}>
                      open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
