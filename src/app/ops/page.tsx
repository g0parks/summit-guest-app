import Link from "next/link";
import {
  getOpsQueues,
  getOpsStays,
  getRecentActivity,
  getRecentIntakes,
  getRecentLeads,
  getRecentlyDeparted,
} from "@/lib/opsQueries";
import {
  applyChangeCancel,
  applyChangeEdit,
  declineChangeRequest,
} from "@/app/actions/ops";
import { buildToken } from "@/lib/tokens";
import { composeRequestNudge } from "@/lib/notifications";
import { formatMoney } from "@/lib/money";
import {
  dayKey,
  formatDateRange,
  formatDayLabel,
  formatTime,
  timeValue,
  tzAbbr,
} from "@/lib/dates";
import { interestedLabels, parseIntakeAnswers } from "@/lib/intakeFlow";
import { isFixedPrice } from "@/lib/catalog";
import { isFeeStructureService } from "@/lib/provisioningPricing";
import { isChangeableStatus } from "@/lib/changePolicy";
import {
  clampParty,
  missingSummary,
  parseRequestDetails,
  serviceFlow,
} from "@/lib/serviceForm";
import QuoteForm from "@/components/ops/QuoteForm";
import ProvisioningPriceForm from "@/components/ops/ProvisioningPriceForm";
import NudgeButton from "@/components/ops/NudgeButton";
import ItineraryItemForm from "@/components/ops/ItineraryItemForm";
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
  // Seeds intentionally omitted (defaults to {}): a seed-gated step is then
  // treated as hidden, which is correct here because no seed-gated step in any
  // flow carries a REQUIRED field — the bar's required fields (mode, freeform)
  // gate on real answers, not seeds. If a seed-gated step ever gains a required
  // field, thread getBarSeeds() through here to keep this count honest.
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
  const [queues, stays, activity, intakes, leads, departed] = await Promise.all([
    getOpsQueues(),
    getOpsStays(),
    getRecentActivity(),
    getRecentIntakes(),
    getRecentLeads(),
    getRecentlyDeparted(),
  ]);

  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";

  /** Nudge draft via the notification seam (composeRequestNudge) — the seam
   *  owns message copy so Track B's programmatic SMS drops in behind it. */
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
    return composeRequestNudge({
      firstName: r.stay.guest.firstName,
      status: r.status,
      what: r.service?.name ?? r.customTitle ?? "your request",
      link: `${base}/t/${buildToken(tokenId)}?next=${encodeURIComponent(`/requests/${r.id}`)}`,
    });
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
                // The pricing paths: fixed-price never lands here. Un-priced
                // QUOTE/custom requests take a quote; fee-structure (grocery +
                // bar) takes an order-cost → computed-charge (no second guest tap).
                const quotable =
                  !r.service || !isFixedPrice(r.service.priceUnit, r.service.priceAmount);
                const feeStructure = isFeeStructureService(r.service?.priceUnit);
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
                        {quotable &&
                          (feeStructure ? (
                            <ProvisioningPriceForm requestId={r.id} />
                          ) : (
                            <QuoteForm requestId={r.id} />
                          ))}
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

      {/* ── 5 · Changes — apply (honor or adjust) or decline; both clear
              the guest's "Being rearranged" chip ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Changes</h2>
        {queues.changes.length === 0 ? (
          <p className={styles.empty}>No change requests waiting.</p>
        ) : (
          queues.changes.map((c) => {
            const tz = c.stay.property.timezone;
            const item = c.itineraryItem;
            return (
              <div key={c.id} className={styles.requestCard}>
                <div className={styles.requestHead}>
                  <span className={styles.requestTitle}>{item.title}</span>
                  <span className={`${styles.badge} ${styles.badgeAction}`}>{c.kind}</span>
                  <span className={`${styles.muted} ${styles.small}`}>
                    asked {when(c.createdAt, tz)}
                  </span>
                </div>
                <p className={styles.small}>
                  {c.stay.guest.firstName} {c.stay.guest.lastName ?? ""}
                  {c.stay.isDemo && (
                    <>
                      {" "}
                      <span className={`${styles.badge} ${styles.badgeNeutral}`}>DEMO</span>
                    </>
                  )}
                  <span className={styles.muted}> @ {c.stay.property.name}</span>
                  {" · currently "}
                  {item.allDay
                    ? `${formatDayLabel(item.startsAt, tz)} · all day`
                    : when(item.startsAt, tz)}
                </p>
                {c.kind === "MOVE" && c.requestedDate && (
                  <p className={styles.small}>
                    Asked for: {c.requestedDate}
                    {c.requestedTime ? ` · ${c.requestedTime}` : ""} (property time)
                  </p>
                )}
                {c.note && <p className={styles.small}>Note: {c.note}</p>}

                <div className={styles.actionsRow}>
                  {c.kind === "CANCEL" && isChangeableStatus(c.serviceRequest?.status) && (
                    <form action={applyChangeCancel}>
                      <input type="hidden" name="changeId" value={c.id} />
                      <button type="submit" className={styles.btnDanger}>
                        Apply — cancel it
                      </button>
                    </form>
                  )}
                  <form action={declineChangeRequest}>
                    <input type="hidden" name="changeId" value={c.id} />
                    <button type="submit" className={styles.btnGhost}>
                      Decline
                    </button>
                  </form>
                  <Link href={`/ops/stays/${c.stayId}`} className={styles.link}>
                    open stay
                  </Link>
                </div>

                {(c.kind === "MOVE" || c.kind === "MODIFY") && (
                  <details className={styles.editDetails}>
                    <summary>Apply — edit the item</summary>
                    <ItineraryItemForm
                      action={applyChangeEdit}
                      hidden={{ changeId: c.id }}
                      defaults={{
                        title: item.title,
                        category: item.category,
                        // MOVE prefills the guest's ask — the operator can
                        // honor it exactly or land somewhere agreed.
                        date:
                          c.kind === "MOVE" && c.requestedDate
                            ? c.requestedDate
                            : dayKey(item.startsAt, tz),
                        // A date-only MOVE ("same time, different day") carries
                        // no requestedTime — fall back to the item's existing
                        // time, NOT "" (empty => parseItineraryFields makes it
                        // all-day at noon, silently dropping the original time).
                        time:
                          c.kind === "MOVE" && c.requestedTime
                            ? c.requestedTime
                            : item.allDay
                              ? ""
                              : timeValue(item.startsAt, tz),
                        endsAtTime: "",
                        location: item.location ?? "",
                        description: item.description ?? "",
                        sortOrder: item.sortOrder,
                      }}
                      tzLabel={tzAbbr(item.startsAt, tz)}
                      submitLabel="Apply change"
                    />
                  </details>
                )}
              </div>
            );
          })
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

      {/* Aerie sales leads — demo pop-up + flyer contact form. PM prospects to
          reach out to (NOT guests to convert); contact is one-tap clickable. */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Aerie leads — prospects</h2>
        {leads.length === 0 ? (
          <p className={styles.empty}>No prospect leads yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Source</th>
                <th>Who</th>
                <th>Contact</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const inquiry = l.source === "aerie-contact";
                return (
                  <tr key={l.id}>
                    <td className={styles.small} style={{ whiteSpace: "nowrap" }}>
                      {formatDayLabel(l.createdAt)} · {formatTime(l.createdAt)}
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${inquiry ? styles.badgeAction : styles.badgeNeutral}`}
                      >
                        {inquiry ? "INQUIRY ★" : "DEMO"}
                      </span>
                    </td>
                    <td>{l.name ?? <span className={styles.muted}>—</span>}</td>
                    <td className={styles.small}>
                      {l.email && (
                        <a className={styles.link} href={`mailto:${l.email}`}>
                          {l.email}
                        </a>
                      )}
                      {l.email && l.phone ? " · " : null}
                      {l.phone && (
                        <a className={styles.link} href={`tel:${l.phone}`}>
                          {l.phone}
                        </a>
                      )}
                      {!l.email && !l.phone && (
                        <span className={styles.muted}>none left</span>
                      )}
                    </td>
                    <td className={styles.small}>{l.note ?? "—"}</td>
                  </tr>
                );
              })}
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
