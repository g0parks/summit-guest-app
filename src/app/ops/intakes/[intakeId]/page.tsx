import Link from "next/link";
import { notFound } from "next/navigation";
import { getConvertProperties, getIntakeDetail } from "@/lib/opsQueries";
import { getGuestEmailConfig } from "@/lib/guestEmail";
import { guestLinkShareMessage } from "@/lib/opsStay";
import { buildToken } from "@/lib/tokens";
import { interestedLabels, parseIntakeAnswers, INTAKE_QUESTIONS } from "@/lib/intakeFlow";
import { formatDayLabel, formatTime } from "@/lib/dates";
import StayForm from "@/components/ops/StayForm";
import GuestLinkPanel from "@/components/ops/GuestLinkPanel";
import styles from "../../ops.module.css";

export const dynamic = "force-dynamic";

/**
 * Entry B — SECONDARY stay creation: convert a /plan lead. Full intake
 * readout + the same StayForm, prefilled. Converted intakes show the panel
 * (link re-derived on every render — nothing secret stored), never the form.
 * World-A intakes (stayId set at intake time) aren't convertible — the stay
 * already exists.
 */
export default async function IntakeDetailPage({
  params,
}: {
  params: Promise<{ intakeId: string }>;
}) {
  const { intakeId } = await params;
  const intake = await getIntakeDetail(intakeId);
  if (!intake) notFound();

  const answers = parseIntakeAnswers(intake.answersJson);
  const interests = interestedLabels(answers);
  const declined = answers
    .filter((a) => a.answer === "declined")
    .map((a) => INTAKE_QUESTIONS.find((q) => q.key === a.key)?.interestLabel ?? a.key);
  const utm =
    intake.utmJson && typeof intake.utmJson === "object" && !Array.isArray(intake.utmJson)
      ? Object.entries(intake.utmJson as Record<string, string>)
      : [];

  const converted = intake.convertedAt != null;
  const worldA = !converted && intake.stayId != null;

  // Converted → re-derive the guest link from the stay's first token.
  const stay = intake.stay;
  const firstToken = stay?.accessTokens[0] ?? null;
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const guestLink =
    converted && firstToken ? `${base}/t/${buildToken(firstToken.id)}` : null;

  // Prefill: name split on first space; contact verbatim; all editable.
  const nameParts = (intake.name ?? "").trim().split(/\s+/);
  const defaults = {
    firstName: nameParts[0] ?? "",
    lastName: nameParts.slice(1).join(" "),
    email: intake.email ?? "",
    phone: intake.phone ?? "",
  };

  const properties = converted || worldA ? [] : await getConvertProperties();

  return (
    <main>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Trip intake — {intake.name ?? "anonymous"}
          {converted && (
            <>
              {" "}
              <span className={`${styles.badge} ${styles.badgeOk}`}>CONVERTED</span>
            </>
          )}
        </h2>
        <dl className={styles.kv}>
          <dt>Taken</dt>
          <dd>
            {formatDayLabel(intake.createdAt)} · {formatTime(intake.createdAt)}
          </dd>
          <dt>Contact</dt>
          <dd>
            {[intake.email, intake.phone].filter(Boolean).join(" · ") || (
              <span className={styles.muted}>none left</span>
            )}
          </dd>
          <dt>Trip timing</dt>
          <dd>{intake.tripTiming ?? <span className={styles.muted}>—</span>}</dd>
          <dt>Interested</dt>
          <dd>
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
          </dd>
          <dt>Passed on</dt>
          <dd className={styles.muted}>{declined.length > 0 ? declined.join(", ") : "—"}</dd>
          <dt>Note</dt>
          <dd>{intake.note ?? <span className={styles.muted}>none</span>}</dd>
          <dt>Source</dt>
          <dd>
            {intake.source ?? <span className={styles.muted}>—</span>}
            {utm.length > 0 && (
              <span className={`${styles.muted} ${styles.small}`}>
                {" "}
                · {utm.map(([k, v]) => `${k}=${v}`).join(" · ")}
              </span>
            )}
          </dd>
          {converted && intake.convertedAt && (
            <>
              <dt>Converted</dt>
              <dd>
                {formatDayLabel(intake.convertedAt)} · {formatTime(intake.convertedAt)}
              </dd>
            </>
          )}
        </dl>
      </section>

      {converted && stay && guestLink ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Converted stay</h2>
          <GuestLinkPanel
            heading={`${stay.guest.firstName} — ${stay.property.name}`}
            stayId={stay.id}
            guestLink={guestLink}
            guestPhone={stay.guest.phone}
            smsMessage={guestLinkShareMessage({
              guestFirstName: stay.guest.firstName,
              propertyName: stay.property.name,
              link: guestLink,
            })}
            emailLine={null}
          />
        </section>
      ) : worldA ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Linked stay</h2>
          <p className={styles.empty}>
            This intake came from a known guest&rsquo;s session — their stay
            already exists.{" "}
            <Link href={`/ops/stays/${intake.stayId}`} className={styles.link}>
              open stay
            </Link>
          </p>
        </section>
      ) : (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Convert to stay</h2>
          <p className={`${styles.small} ${styles.muted}`} style={{ margin: "0 0 10px" }}>
            Everything below is editable — the intake prefills, the operator
            decides. Converting creates the guest, the stay, and the trip link.
          </p>
          <div className={styles.requestCard}>
            <StayForm
              properties={properties.map((p) => ({ id: p.id, name: p.name }))}
              emailEnabled={getGuestEmailConfig().enabled}
              intakeId={intake.id}
              defaults={defaults}
              submitLabel="Convert to stay & mint link"
            />
          </div>
        </section>
      )}
    </main>
  );
}
