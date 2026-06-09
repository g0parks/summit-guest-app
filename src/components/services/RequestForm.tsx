"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { PriceUnit } from "@prisma/client";
import { createServiceRequest, type RequestResult } from "@/app/actions/requests";
import { formatMoney } from "@/lib/money";
import styles from "./RequestForm.module.css";

type ServiceProps = {
  id: string;
  name: string;
  priceUnit: PriceUnit;
  priceAmount: number | null;
  requiresDate: boolean;
  requiresTime: boolean;
  requiresPartySize: boolean;
};

const isQuote = (u: PriceUnit, amt: number | null) => u === "QUOTE" || amt == null;

export default function RequestForm({
  service,
  defaultPartySize,
  currency,
}: {
  service: ServiceProps;
  defaultPartySize: number;
  currency: string;
}) {
  const [state, action, pending] = useActionState<RequestResult | null, FormData>(
    createServiceRequest,
    null,
  );

  if (state?.ok) {
    const confirmed = state.status === "CONFIRMED";
    return (
      <div className={styles.done}>
        <span className={styles.check} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </span>
        <h2 className={styles.doneTitle}>
          {confirmed ? "You’re all set." : "Request received."}
        </h2>
        <p className={styles.doneBody}>
          {confirmed ? (
            <>
              {state.serviceName} is confirmed
              {state.chargedCents != null ? (
                <>
                  {" "}
                  and added to your tab — <strong>{formatMoney(state.chargedCents, currency)}</strong>
                </>
              ) : null}
              .
            </>
          ) : (
            <>Your concierge will confirm {state.serviceName} and pricing shortly.</>
          )}
        </p>
        <div className={styles.doneActions}>
          <Link href="/tab" className={styles.primaryLink}>
            View your tab
          </Link>
          <Link href="/services" className={styles.secondaryLink}>
            Back to concierge
          </Link>
        </div>
      </div>
    );
  }

  const quote = isQuote(service.priceUnit, service.priceAmount);

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="serviceId" value={service.id} />

      {service.requiresDate && (
        <label className={styles.field}>
          <span className={styles.label}>Date</span>
          <input type="date" name="date" required className={styles.input} />
        </label>
      )}

      {service.requiresTime && (
        <label className={styles.field}>
          <span className={styles.label}>Preferred time</span>
          <input type="time" name="time" className={styles.input} />
        </label>
      )}

      {service.requiresPartySize && (
        <label className={styles.field}>
          <span className={styles.label}>Guests</span>
          <input
            type="number"
            name="partySize"
            min={1}
            max={20}
            defaultValue={defaultPartySize}
            className={styles.input}
          />
        </label>
      )}

      <label className={styles.field}>
        <span className={styles.label}>
          Anything we should know? <span className={styles.optional}>optional</span>
        </span>
        <textarea
          name="notes"
          rows={3}
          className={styles.textarea}
          placeholder="Allergies, preferences, timing…"
        />
      </label>

      {state && !state.ok && <p className={styles.error}>{state.error}</p>}

      <button type="submit" disabled={pending} className={styles.submit}>
        {pending ? "Sending…" : quote ? "Request a quote" : "Request & add to tab"}
      </button>

      <p className={styles.note}>
        {quote
          ? "We’ll confirm availability and pricing before anything is charged."
          : "One running tab — you’ll never pull out your wallet."}
      </p>
    </form>
  );
}
