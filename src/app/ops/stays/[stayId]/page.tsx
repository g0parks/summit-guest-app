import { notFound } from "next/navigation";
import type { PerkClaimStatus, RequestStatus, TabItemStatus } from "@prisma/client";
import { getOpsStayDetail } from "@/lib/opsQueries";
import {
  addManualTabLine,
  createItineraryItem,
  setLineEconomics,
  setPerkClaimStatus,
  setRequestStatus,
  updateItineraryItem,
} from "@/app/actions/ops";
import QuoteForm from "@/components/ops/QuoteForm";
import ChargeButton from "@/components/ops/ChargeButton";
import ItineraryItemForm from "@/components/ops/ItineraryItemForm";
import DeleteItineraryItemButton from "@/components/ops/DeleteItineraryItemButton";
import { formatMoney } from "@/lib/money";
import {
  dayKey,
  formatDateRange,
  formatDayLabel,
  formatTime,
  timeValue,
  tzAbbr,
} from "@/lib/dates";
import { parseRequestDetails } from "@/lib/serviceForm";
import styles from "../../ops.module.css";

export const dynamic = "force-dynamic";

/** Mirrors the action's transition allowlist — buttons we render per status. */
const NEXT_MOVES: Partial<Record<RequestStatus, RequestStatus[]>> = {
  REQUESTED: ["DECLINED", "CANCELLED"],
  CONFIRMED: ["SCHEDULED", "COMPLETED", "CANCELLED"],
  SCHEDULED: ["COMPLETED", "CANCELLED"],
};

const MOVE_LABEL: Partial<Record<RequestStatus, string>> = {
  SCHEDULED: "Mark scheduled",
  COMPLETED: "Mark completed",
  DECLINED: "Decline",
  CANCELLED: "Cancel",
};

const REQUEST_BADGE: Record<RequestStatus, string> = {
  REQUESTED: styles.badgeAction!,
  CONFIRMED: styles.badgeOk!,
  SCHEDULED: styles.badgeNeutral!,
  COMPLETED: styles.badgeNeutral!,
  DECLINED: styles.badgeVoid!,
  CANCELLED: styles.badgeVoid!,
};

const LINE_BADGE: Record<TabItemStatus, string> = {
  PENDING: styles.badgeAction!,
  CHARGED: styles.badgeOk!,
  REFUNDED: styles.badgeNeutral!,
  VOID: styles.badgeVoid!,
};

const CLAIM_BADGE: Record<PerkClaimStatus, string> = {
  CLAIMED: styles.badgeAction!,
  FULFILLED: styles.badgeOk!,
  CANCELLED: styles.badgeVoid!,
};

/** "$x (17.5%)" — net as a share of the line amount; drift outside 15–20% flagged. */
function NetCell({ netCents, amount, currency }: { netCents: number | null; amount: number; currency: string }) {
  if (netCents == null) return <span className={styles.muted}>—</span>;
  if (amount === 0) return <span>{formatMoney(netCents, currency)}</span>;
  const pct = (netCents / amount) * 100;
  const drifted = pct < 15 || pct > 20;
  return (
    <span className={drifted ? styles.netDrift : undefined}>
      {formatMoney(netCents, currency)} ({pct.toFixed(1)}%)
    </span>
  );
}

export default async function OpsStayPage({
  params,
}: {
  params: Promise<{ stayId: string }>;
}) {
  const { stayId } = await params;
  const stay = await getOpsStayDetail(stayId);
  if (!stay) notFound();

  const tz = stay.property.timezone;
  const lastAccessedAt = stay.accessTokens.reduce<Date | null>(
    (latest, t) =>
      t.lastAccessedAt && (!latest || t.lastAccessedAt > latest)
        ? t.lastAccessedAt
        : latest,
    null,
  );
  const defaultCard =
    stay.paymentMethods.find((c) => c.isDefault) ?? stay.paymentMethods[0] ?? null;
  const when = (d: Date) => `${formatDayLabel(d, tz)} · ${formatTime(d, tz)}`;

  return (
    <main>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {stay.guest.firstName} {stay.guest.lastName ?? ""} — {stay.property.name}
          {stay.isDemo && (
            <>
              {" "}
              <span className={`${styles.badge} ${styles.badgeNeutral}`}>DEMO</span>
            </>
          )}
        </h2>
        <dl className={styles.kv}>
          <dt>Dates</dt>
          <dd>
            {formatDateRange(stay.arrivalDate, stay.departureDate, tz)}
            <span className={styles.muted}> · {stay.status}</span>
          </dd>
          <dt>Party</dt>
          <dd>{stay.partySize ?? "—"}</dd>
          <dt>Email</dt>
          <dd>{stay.guest.email ?? <span className={styles.muted}>none</span>}</dd>
          <dt>Phone</dt>
          <dd>{stay.guest.phone ?? <span className={styles.muted}>none</span>}</dd>
          <dt>Guest notes</dt>
          <dd>{stay.guest.notes ?? <span className={styles.muted}>none</span>}</dd>
          <dt>Card on file</dt>
          <dd>
            {defaultCard ? (
              `${defaultCard.brand} •••• ${defaultCard.last4} (${defaultCard.expMonth}/${defaultCard.expYear})`
            ) : (
              <span className={styles.muted}>none</span>
            )}
          </dd>
          <dt>Last opened</dt>
          <dd>
            {lastAccessedAt ? when(lastAccessedAt) : <span className={styles.muted}>never</span>}
          </dd>
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Requests</h2>
        {stay.serviceRequests.length === 0 ? (
          <p className={styles.empty}>No requests yet.</p>
        ) : (
          stay.serviceRequests.map((r) => (
            <div key={r.id} className={styles.requestCard}>
              <div className={styles.requestHead}>
                <span className={styles.requestTitle}>
                  {r.service?.name ?? r.customTitle ?? "Custom request"}
                </span>
                <span className={`${styles.badge} ${REQUEST_BADGE[r.status]}`}>
                  {r.status}
                </span>
                <span className={`${styles.muted} ${styles.small}`}>
                  requested {when(r.createdAt)}
                </span>
              </div>
              <p className={styles.small}>
                For: {r.requestedFor ? when(r.requestedFor) : "—"} · Party:{" "}
                {r.partySize ?? "—"} · Quoted:{" "}
                {r.quotedAmount != null ? formatMoney(r.quotedAmount, stay.currency) : "—"}
              </p>
              {parseRequestDetails(r.detailsJson).map((d) => (
                <p key={d.label} className={styles.small}>
                  {d.label}: {d.value}
                </p>
              ))}
              {r.notes && <p className={styles.small}>Notes: {r.notes}</p>}
              {r.operatorNote && (
                <p className={`${styles.small} ${styles.muted}`}>Op note: {r.operatorNote}</p>
              )}

              <div className={styles.actionsRow}>
                {r.status === "REQUESTED" && <QuoteForm requestId={r.id} />}
                {(NEXT_MOVES[r.status] ?? []).map((next) => (
                  <form key={next} action={setRequestStatus}>
                    <input type="hidden" name="requestId" value={r.id} />
                    <input type="hidden" name="status" value={next} />
                    <button
                      type="submit"
                      className={
                        next === "DECLINED" || next === "CANCELLED"
                          ? styles.btnDanger
                          : styles.btnGhost
                      }
                    >
                      {MOVE_LABEL[next]}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Perk claims — internal cost never leaves /ops</h2>
        {stay.perkClaims.length === 0 ? (
          <p className={styles.empty}>No perks claimed.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Perk</th>
                <th>Claimed</th>
                <th>Contact left</th>
                <th>Opt-in</th>
                <th className={styles.num}>Cost (CAC)</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stay.perkClaims.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.perk.name}
                    {c.perk.vendorName && (
                      <span className={styles.muted}> · {c.perk.vendorName}</span>
                    )}
                  </td>
                  <td className={styles.small}>{when(c.createdAt)}</td>
                  <td className={styles.small}>
                    {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td>
                    {c.marketingOptIn ? (
                      <span className={`${styles.badge} ${styles.badgeOk}`}>OPT-IN</span>
                    ) : (
                      <span className={styles.muted}>no</span>
                    )}
                  </td>
                  <td className={styles.num}>
                    {c.perk.costCents != null ? (
                      formatMoney(c.perk.costCents, stay.currency)
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${CLAIM_BADGE[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>
                    {c.status === "CLAIMED" && (
                      <div className={styles.actionsRow}>
                        <form action={setPerkClaimStatus}>
                          <input type="hidden" name="perkClaimId" value={c.id} />
                          <input type="hidden" name="status" value="FULFILLED" />
                          <button type="submit" className={styles.btnGhost}>
                            Mark fulfilled
                          </button>
                        </form>
                        <form action={setPerkClaimStatus}>
                          <input type="hidden" name="perkClaimId" value={c.id} />
                          <input type="hidden" name="status" value="CANCELLED" />
                          <button type="submit" className={styles.btnDanger}>
                            Cancel
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Tab — internal economics never leave /ops</h2>
        {stay.tabLineItems.length === 0 ? (
          <p className={styles.empty}>Nothing on the tab.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Line</th>
                <th>When</th>
                <th className={styles.num}>Amount</th>
                <th>Status</th>
                <th className={styles.num}>Vendor</th>
                <th className={styles.num}>PM share</th>
                <th className={styles.num}>Net</th>
                <th>Economics</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stay.tabLineItems.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td className={styles.small}>{formatDayLabel(l.occurredAt, tz)}</td>
                  <td className={styles.num}>{formatMoney(l.amount, l.currency)}</td>
                  <td>
                    <span className={`${styles.badge} ${LINE_BADGE[l.status]}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className={styles.num}>
                    {l.vendorCostCents != null ? (
                      formatMoney(l.vendorCostCents, l.currency)
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                  <td className={styles.num}>
                    {l.pmShareCents != null ? (
                      formatMoney(l.pmShareCents, l.currency)
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                  <td className={styles.num}>
                    <NetCell netCents={l.netCents} amount={l.amount} currency={l.currency} />
                  </td>
                  <td>
                    <form action={setLineEconomics} className={styles.inlineForm}>
                      <input type="hidden" name="tabLineItemId" value={l.id} />
                      <input
                        name="vendorCost"
                        inputMode="decimal"
                        placeholder="vendor $"
                        defaultValue={
                          l.vendorCostCents != null ? (l.vendorCostCents / 100).toString() : ""
                        }
                        className={styles.input}
                        aria-label="Vendor cost (dollars)"
                      />
                      <input
                        name="pmShare"
                        inputMode="decimal"
                        placeholder="PM $"
                        defaultValue={
                          l.pmShareCents != null ? (l.pmShareCents / 100).toString() : ""
                        }
                        className={styles.input}
                        aria-label="PM share (dollars)"
                      />
                      <button type="submit" className={styles.btnGhost}>
                        Save
                      </button>
                    </form>
                  </td>
                  <td>{l.status === "PENDING" && <ChargeButton tabLineItemId={l.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className={styles.requestCard} style={{ marginTop: 10 }}>
          <h3 className={styles.sectionTitle}>Add manual line (off-catalog)</h3>
          <form action={addManualTabLine} className={styles.inlineForm}>
            <input type="hidden" name="stayId" value={stay.id} />
            <input
              name="description"
              placeholder="description"
              required
              className={`${styles.input} ${styles.inputWide}`}
              aria-label="Line description"
            />
            <input
              name="amount"
              inputMode="decimal"
              placeholder="amount $"
              required
              className={styles.input}
              aria-label="Amount (dollars)"
            />
            <input
              name="vendorCost"
              inputMode="decimal"
              placeholder="vendor $"
              className={styles.input}
              aria-label="Vendor cost (dollars)"
            />
            <button type="submit" className={styles.btn}>
              Add to tab
            </button>
          </form>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Itinerary — times are property-local</h2>
        {stay.itineraryItems.length === 0 ? (
          <p className={styles.empty}>Nothing scheduled.</p>
        ) : (
          stay.itineraryItems.map((it) => (
            <div key={it.id} className={styles.requestCard}>
              <div className={styles.requestHead}>
                <span className={styles.requestTitle}>{it.title}</span>
                <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                  {it.category}
                </span>
                {it.changePending && (
                  <span className={`${styles.badge} ${styles.badgeAction}`}>
                    REARRANGING
                  </span>
                )}
                {it.serviceRequestId && (
                  <span className={`${styles.muted} ${styles.small}`}>
                    linked to a request — deleting here won&rsquo;t touch it
                  </span>
                )}
              </div>
              <p className={styles.small}>
                {it.allDay
                  ? `${formatDayLabel(it.startsAt, tz)} · All day`
                  : `${formatDayLabel(it.startsAt, tz)} · ${formatTime(it.startsAt, tz)}${
                      it.endsAt ? `–${formatTime(it.endsAt, tz)}` : ""
                    } ${tzAbbr(it.startsAt, tz)}`}
                {it.location && ` · ${it.location}`}
              </p>
              {it.description && (
                <p className={`${styles.small} ${styles.muted}`}>{it.description}</p>
              )}

              <div className={styles.actionsRow}>
                {/* One-click changePending flip — posts the full current state
                    (wall-clock, property tz) through updateItineraryItem. */}
                <form action={updateItineraryItem}>
                  <input type="hidden" name="itemId" value={it.id} />
                  <input type="hidden" name="title" value={it.title} />
                  <input type="hidden" name="category" value={it.category} />
                  <input type="hidden" name="date" value={dayKey(it.startsAt, tz)} />
                  <input
                    type="hidden"
                    name="time"
                    value={it.allDay ? "" : timeValue(it.startsAt, tz)}
                  />
                  <input
                    type="hidden"
                    name="endsAtTime"
                    value={it.endsAt ? timeValue(it.endsAt, tz) : ""}
                  />
                  <input type="hidden" name="location" value={it.location ?? ""} />
                  <input type="hidden" name="description" value={it.description ?? ""} />
                  <input type="hidden" name="sortOrder" value={String(it.sortOrder)} />
                  {!it.changePending && (
                    <input type="hidden" name="changePending" value="on" />
                  )}
                  <button type="submit" className={styles.btnGhost}>
                    {it.changePending
                      ? "Clear “being rearranged”"
                      : "Mark “being rearranged”"}
                  </button>
                </form>
                <DeleteItineraryItemButton
                  itemId={it.id}
                  title={it.title}
                  linked={it.serviceRequestId != null}
                />
              </div>

              <details className={styles.editDetails}>
                <summary>Edit</summary>
                <ItineraryItemForm
                  action={updateItineraryItem}
                  hidden={{ itemId: it.id }}
                  defaults={{
                    title: it.title,
                    category: it.category,
                    date: dayKey(it.startsAt, tz),
                    time: it.allDay ? "" : timeValue(it.startsAt, tz),
                    endsAtTime: it.endsAt ? timeValue(it.endsAt, tz) : "",
                    location: it.location ?? "",
                    description: it.description ?? "",
                    sortOrder: it.sortOrder,
                    changePending: it.changePending,
                  }}
                  tzLabel={tzAbbr(it.startsAt, tz)}
                  withChangePending
                  submitLabel="Save changes"
                />
              </details>
            </div>
          ))
        )}

        <div className={styles.requestCard} style={{ marginTop: 10 }}>
          <details className={styles.editDetails}>
            <summary>Add item</summary>
            <ItineraryItemForm
              action={createItineraryItem}
              hidden={{ stayId: stay.id }}
              defaults={{ date: dayKey(stay.arrivalDate, tz) }}
              tzLabel={tzAbbr(new Date(), tz)}
              submitLabel="Add to itinerary"
            />
          </details>
        </div>
      </section>
    </main>
  );
}
