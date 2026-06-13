import Link from "next/link";
import {
  getOpsQueues,
  getOpsStays,
  getRecentActivity,
  getRecentIntakes,
  getRecentlyDeparted,
} from "@/lib/opsQueries";
import { buildToken } from "@/lib/tokens";
import { formatMoney } from "@/lib/money";
import { formatDateRange, formatDayLabel, formatTime } from "@/lib/dates";
import { interestedLabels, parseIntakeAnswers } from "@/lib/intakeFlow";
import { isFixedPrice } from "@/lib/catalog";
import {
  clampParty,
  missingSummary,
  parseRequestDetails,
  serviceFlow,
} from "@/lib/serviceForm";
import QuoteForm from "@/components/ops/QuoteForm";
import NudgeButton from "@/components/ops/NudgeButton";
import styles from "./ops.module.css";

export const dynamic = "force-dynamic";

/**
 * The dashboard = the six queues (Product Doctrine 2026-06-12), one action
 * each: New signals (watch) · Awaiting guest (nudge) · Ready to route
 * (quote/route) · Scheduled (deliver) · Changes (resolve — PR C) · To settle
 * (charge). Loading the page also runs the lazy EXPIRED sweep, so departed
 * stays' abandoned signals leave the queues but stay on the book as demand
 * data.
 */

type QueueStay = {
  id: string;
  isDemo: boolean;
  guest: { firstName: string; lastName: string | null };
  property: { name: string };
};

type QueueRequest = {
  requestedFor: Date | null;
  partySize: number | null;
  detailsJson: unknown;
  service: {
    slug: string;
    name: string;
    requiresDate: boolean;
  } | null;
  customTitle: string | null;
};

function GuestCell({ stay }: { stay: QueueStay }) {
  return (
    <td>
      {stay.guest.firstName} {stay.guest.lastName ?? ""}
      {stay.isDemo && (
        <>
          {" "}
          <span className={`${styles.badge} ${styles.badgeNeutral}`}>DEMO</span>
        </>
      )}
      <span className={styles.muted}> @ {stay.property.name}</span>
    </td>
  );
}

function requestTitle(r: QueueRequest): string {
  return r.service?.name ?? r.customTitle ?? "Custom request";
}

/** Ops-glance summary of what the guest still owes the wizard. */
function missingFor(r: QueueRequest): string {
  if (!r.service) return "—";
  return missingSummary(
    serviceFlow(r.service.slug),
    parseRequestDetails(r.detailsJson),
    clampParty(r.partySize),
    Boolean(r.service.requiresDate && !r.requestedFor),
  );
}

/** First token that still resolves — what the nudge deep link rides on. */
function liveTokenId(
  tokens: { id: string; revokedAt: Date | null; expiresAt: Date | null }[],
): string | null {
  const now = Date.now();
  return (
    tokens.find((t) => !t.revokedAt && (!t.expiresAt || t.expiresAt.getTime() > now))
      ?.id ?? null
  );
}

export default async function OpsOverviewPage() {
  const [queues, stays, activity, intakes, departed] = await Promise.all([
    getOpsQueues(),
    getOpsStays(),
    getRecentActivity(),
    getRecentIntakes(),
    getRecentlyDeparted(),
  ]);

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";

  /** Concierge-register nudge draft, wizard deep link included. A stalled
   *  signal asks for details; an outstanding quote asks for the yes. */
  const nudgeMessage = (r: {
    id: string;
    status: string;
    service: { name: string } | null;
    customTitle: string | null;
    stay: {
      guest: { firstName: string };
      accessTokens: { id: string; revokedAt: Date | null; expiresAt: Date | null }[];
    };
  }): string | null => {
    const tokenId = liveTokenId(r.stay.accessTokens);
    if (!tokenId) return null;
    const link = `${base}/t/${buildToken(tokenId)}?next=${encodeURIComponent(`/requests/${r.id}`)}`;
    const what = r.service?.name ?? r.customTitle ?? "your request";
    return r.status === "QUOTED"
      ? `Hi ${r.stay.guest.firstName} — your concierge here. ${what} is priced and ready — one tap to approve and it's done: ${link}`
      : `Hi ${r.stay.guest.firstName} — your concierge here. ${what} is nearly arranged — a few details and it's done: ${link}`;
  };

  const when = (d: Date | null, tz?: string) =>
    d ? `${formatDayLabel(d, tz)} · ${formatTime(d, tz)}` : "—";

  return (
    <main>
      {/* Path A is PRIMARY: PMS-sourced guest data gets keyed here today;
          the future PMS feed calls the same creation core. */}
      <div className={styles.pageActions}>
        <Link href="/ops/stays/new" className={styles.btnLink}>
          + New stay
        </Link>
      </div>

      {/* ── 1 · New signals — fresh taps, the guest is likely mid-wizard ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>New signals — last 24h</h2>
        {queues.newSignals.length === 0 ? (
          <p className={styles.empty}>No fresh taps.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Request</th>
                <th>Guest</th>
                <th>Source</th>
                <th>Signaled</th>
                <th>Missing</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queues.newSignals.map((r) => (
                <tr key={r.id}>
                  <td>{requestTitle(r)}</td>
                  <GuestCell stay={r.stay} />
                  <td className={styles.small}>{r.source}</td>
                  <td className={styles.small}>
                    {when(r.createdAt, r.stay.property.timezone)}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                      {missingFor(r)}
                    </span>
                  </td>
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

      {/* ── 2 · Awaiting guest — stalled signals + every outstanding quote;
              the action is the Nudge ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Awaiting guest — nudge</h2>
        {queues.awaitingGuest.length === 0 ? (
          <p className={styles.empty}>Nobody&rsquo;s stalled.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Request</th>
                <th>Guest</th>
                <th>Signaled</th>
                <th>Waiting on</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queues.awaitingGuest.map((r) => {
                const message = nudgeMessage(r);
                return (
                  <tr key={r.id}>
                    <td>{requestTitle(r)}</td>
                    <GuestCell stay={r.stay} />
                    <td className={styles.small}>
                      {when(r.createdAt, r.stay.property.timezone)}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgeAction}`}>
                        {r.status === "QUOTED" && r.quotedAmount != null
                          ? `approve — ${formatMoney(r.quotedAmount, r.stay.currency)}`
                          : missingFor(r)}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionsRow}>
                        {message ? (
                          <NudgeButton
                            guestPhone={r.stay.guest.phone}
                            message={message}
                          />
                        ) : (
                          <span className={`${styles.muted} ${styles.small}`}>
                            no live link
                          </span>
                        )}
                        <Link href={`/ops/stays/${r.stayId}`} className={styles.link}>
                          open
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 3 · Ready to route — execution-complete; price QUOTE dishes ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Ready to route</h2>
        {queues.readyToRoute.length === 0 ? (
          <p className={styles.empty}>Nothing to route.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Request</th>
                <th>Guest</th>
                <th>When</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queues.readyToRoute.map((r) => {
                // The two pricing paths: only un-priced (QUOTE / custom)
                // requests take a quote. Fixed-price never lands here.
                const quotable =
                  !r.service || !isFixedPrice(r.service.priceUnit, r.service.priceAmount);
                return (
                  <tr key={r.id}>
                    <td>{requestTitle(r)}</td>
                    <GuestCell stay={r.stay} />
                    <td className={styles.small}>
                      {when(r.requestedFor, r.stay.property.timezone)}
                    </td>
                    <td className={styles.small}>{r.notes ?? "—"}</td>
                    <td>
                      <div className={styles.actionsRow}>
                        {quotable && <QuoteForm requestId={r.id} />}
                        <Link href={`/ops/stays/${r.stayId}`} className={styles.link}>
                          open
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 4 · Scheduled — being delivered in the next 48h ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Scheduled — next 48h</h2>
        {queues.scheduled.length === 0 ? (
          <p className={styles.empty}>Nothing due.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Status</th>
                <th>Request</th>
                <th>Guest</th>
                <th>When</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queues.scheduled.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeOk}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>{requestTitle(r)}</td>
                  <GuestCell stay={r.stay} />
                  <td className={styles.small}>
                    {when(r.requestedFor, r.stay.property.timezone)}
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

      {/* ── 5 · Changes — structured change flows land in the next build ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Changes</h2>
        {queues.openChangeCount === 0 ? (
          <p className={styles.empty}>No change requests waiting.</p>
        ) : (
          <p className={styles.empty}>
            {queues.openChangeCount} open — structured change handling lands
            with the next build.
          </p>
        )}
      </section>

      {/* ── 6 · To settle — delivered or departed, money still pending ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>To settle</h2>
        {queues.toSettle.length === 0 && departed.length === 0 ? (
          <p className={styles.empty}>All squared away.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>What</th>
                <th>Item</th>
                <th>Guest</th>
                <th className={styles.num}>Pending</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queues.toSettle.map((r) => (
                <tr key={`req-${r.id}`}>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeAction}`}>
                      COMPLETED
                    </span>
                  </td>
                  <td>{requestTitle(r)}</td>
                  <GuestCell stay={r.stay} />
                  <td className={styles.num}>
                    {formatMoney(
                      r.tabLineItems.reduce((sum, l) => sum + l.amount, 0),
                      r.stay.currency,
                    )}
                  </td>
                  <td>
                    <Link href={`/ops/stays/${r.stayId}`} className={styles.link}>
                      open
                    </Link>
                  </td>
                </tr>
              ))}
              {departed.map((s) => (
                <tr key={`stay-${s.id}`}>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                      DEPARTED
                    </span>
                  </td>
                  <td>Close out the stay</td>
                  <GuestCell stay={s} />
                  <td className={styles.num}>{formatMoney(s.pendingCents, s.currency)}</td>
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

      {/* Perk claims aren't a lifecycle queue, but they still need arranging. */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Perk claims — to arrange</h2>
        {queues.perkClaims.length === 0 ? (
          <p className={styles.empty}>No claims waiting.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Perk</th>
                <th>Guest</th>
                <th>Claimed</th>
                <th>Contact left</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queues.perkClaims.map((c) => (
                <tr key={c.id}>
                  <td>{c.perk.name}</td>
                  <GuestCell stay={c.stay} />
                  <td className={styles.small}>
                    {when(c.createdAt, c.stay.property.timezone)}
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
