import {
  getDemandBook,
  getEconomicsRollup,
  getPartnerValue,
  getUnconvertedDemand,
  pmRecapText,
} from "@/lib/opsBook";
import { CATEGORY_LABEL } from "@/lib/catalog";
import type { ServiceCategory } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import { formatDayLabel } from "@/lib/dates";
import CopyTextButton from "@/components/ops/CopyTextButton";
import styles from "../ops.module.css";
import bookStyles from "./book.module.css";

export const dynamic = "force-dynamic";

/**
 * The Broker's Book — Summit's data, legible (the triangle, 2026-06-12):
 *  (a) market layer: forward demand + the unconverted record = the cross-PM
 *      demand graph, visible.
 *  (b) PM value: per-partner story with a copy-ready recap — every number
 *      PM-safe, internal economics never rendered in that section.
 *  (c) vendor value: the forward book is what the operator shows a vendor —
 *      "here's what's coming through the pipe."
 * Demo sandboxes excluded throughout. Read-only: the queues act, the book
 * informs — oversight without automation.
 */

function categoryLabel(raw: string): string {
  if (raw === "MANUAL") return "Manual lines";
  return CATEGORY_LABEL[raw as ServiceCategory] ?? raw;
}

export default async function OpsBookPage() {
  const [demand, unconverted, economics, partners] = await Promise.all([
    getDemandBook(),
    getUnconvertedDemand(),
    getEconomicsRollup(),
    getPartnerValue(),
  ]);

  return (
    <main>
      {/* ── Forward demand — the vendor conversation ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>The demand book — forward</h2>
        <p className={`${styles.small} ${styles.muted}`}>
          Booked = vendor-bookable. In motion = signals maturing. Leads =
          unconverted /plan interest. This table is what you show a vendor.
        </p>
        {demand.length === 0 ? (
          <p className={styles.empty}>No open demand on the book.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Service</th>
                <th className={styles.num}>Booked</th>
                <th className={styles.num}>In motion</th>
                <th className={styles.num}>Leads</th>
                <th className={styles.num}>Heads</th>
                <th>Next date</th>
                <th className={styles.num}>Committed</th>
                <th className={styles.num}>Awaiting yes</th>
              </tr>
            </thead>
            <tbody>
              {demand.map((row) => (
                <tr key={row.key}>
                  <td>
                    {row.serviceName}{" "}
                    <span className={`${styles.muted} ${styles.small}`}>
                      {categoryLabel(row.category)}
                    </span>
                  </td>
                  <td className={styles.num}>{row.booked || "—"}</td>
                  <td className={styles.num}>{row.inMotion || "—"}</td>
                  <td className={styles.num}>{row.leadInterest || "—"}</td>
                  <td className={styles.num}>{row.heads || "—"}</td>
                  <td className={styles.small}>
                    {row.nextDate ? formatDayLabel(row.nextDate) : "—"}
                  </td>
                  <td className={styles.num}>
                    {row.committedCents ? formatMoney(row.committedCents) : "—"}
                  </td>
                  <td className={styles.num}>
                    {row.awaitingYesCents ? formatMoney(row.awaitingYesCents) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Unconverted demand — the record of what was wanted ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Unconverted demand — the record</h2>
        <p className={`${styles.small} ${styles.muted}`}>
          Wanted but never landed. Next-stay personalization and vendor-terms
          ammunition — kept, never deleted.
        </p>
        {unconverted.length === 0 ? (
          <p className={styles.empty}>Nothing on the record yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Service</th>
                <th className={styles.num}>Expired</th>
                <th className={styles.num}>Declined</th>
              </tr>
            </thead>
            <tbody>
              {unconverted.map((row) => (
                <tr key={row.serviceName}>
                  <td>{row.serviceName}</td>
                  <td className={styles.num}>{row.expired || "—"}</td>
                  <td className={styles.num}>{row.declined || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Economics — INTERNAL ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Economics — internal{" "}
          <span className={`${styles.badge} ${styles.badgeVoid}`}>
            NEVER GUEST- OR PM-FACING
          </span>
        </h2>
        <div className={styles.kv}>
          <span>Charged</span>
          <span className="tabular">{formatMoney(economics.chargedCents)}</span>
          <span>Pending</span>
          <span className="tabular">{formatMoney(economics.pendingCents)}</span>
          <span>Vendor cost</span>
          <span className="tabular">{formatMoney(economics.vendorCostCents)}</span>
          <span>Net (where tracked)</span>
          <span className="tabular">
            {formatMoney(economics.netCents)}
            <span className={`${styles.muted} ${styles.small}`}>
              {" "}
              · economics on {economics.linesWithEconomics}/{economics.lines} lines
            </span>
          </span>
        </div>
        {economics.byCategory.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Category</th>
                <th className={styles.num}>GMV</th>
                <th className={styles.num}>Net</th>
                <th className={styles.num}>Lines</th>
              </tr>
            </thead>
            <tbody>
              {economics.byCategory.map((c) => (
                <tr key={c.label}>
                  <td>{categoryLabel(c.label)}</td>
                  <td className={styles.num}>{formatMoney(c.gmvCents)}</td>
                  <td className={styles.num}>{c.netCents ? formatMoney(c.netCents) : "—"}</td>
                  <td className={styles.num}>{c.lines}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {economics.byPartner.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Partner</th>
                <th className={styles.num}>GMV</th>
                <th className={styles.num}>Net</th>
                <th className={styles.num}>Lines</th>
              </tr>
            </thead>
            <tbody>
              {economics.byPartner.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className={styles.num}>{formatMoney(p.gmvCents)}</td>
                  <td className={styles.num}>{p.netCents ? formatMoney(p.netCents) : "—"}</td>
                  <td className={styles.num}>{p.lines}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Partner value — the PM story, copy-ready ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Partner value — the PM story</h2>
        <p className={`${styles.small} ${styles.muted}`}>
          Every number below is PM-safe. The recap is paste-ready — no
          internal economics, no pricing-model language.
        </p>
        {partners.length === 0 ? (
          <p className={styles.empty}>No partner stays on the book yet.</p>
        ) : (
          partners.map((p) => {
            const recap = pmRecapText(p, formatMoney(p.gmvCents));
            return (
              <div key={p.partnerName} className={styles.requestCard}>
                <div className={styles.requestHead}>
                  <span className={styles.requestTitle}>{p.partnerName}</span>
                  <span className={`${styles.badge} ${styles.badgeOk}`}>
                    {formatMoney(p.gmvCents)} GUEST SERVICES
                  </span>
                </div>
                <p className={styles.small}>
                  {p.stays} stay{p.stays === 1 ? "" : "s"} ({p.upcomingStays} upcoming) ·{" "}
                  {p.guests} guest{p.guests === 1 ? "" : "s"} · {p.requestsArranged} arranged
                  / {p.requestsFulfilled} delivered · {p.perksClaimed} perks claimed ·{" "}
                  {p.contactsCaptured} contacts captured ({p.optIns} opt-in) ·{" "}
                  {p.returnIntents} return intent{p.returnIntents === 1 ? "" : "s"}
                </p>
                <pre className={bookStyles.recap}>{recap}</pre>
                <div className={styles.actionsRow}>
                  <CopyTextButton value={recap} label="Copy PM recap" />
                </div>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
