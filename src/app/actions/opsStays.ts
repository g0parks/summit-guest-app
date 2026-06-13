"use server";

import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/opsSession";
import {
  createStayWithToken,
  enrollIntakeSignals,
  guestLinkShareMessage,
  StayInputError,
} from "@/lib/opsStay";
import { interestedSlugs, parseIntakeAnswers } from "@/lib/intakeFlow";
import { buildToken } from "@/lib/tokens";
import { getGuestEmailConfig, sendWelcomeEmail } from "@/lib/guestEmail";
import { recordTouch } from "@/lib/touchpoints";

/**
 * Stay creation — the two ops front doors converge here. Entry A (manual
 * "New stay", PMS-data-first) posts without an intakeId; Entry B (convert a
 * /plan lead) posts with one. Both run the SAME core inside one transaction.
 */

/** Everything the created/converted panel renders. */
export type StayCreatedPanelData = {
  stayId: string;
  guestLink: string;
  guestFirstName: string;
  guestPhone: string | null;
  propertyName: string;
  smsMessage: string;
  /** Honest welcome-email status line; null = nothing to report. */
  emailLine: string | null;
};

export type StayFormResult =
  | ({ ok: true } & StayCreatedPanelData)
  | { ok: false; error: string };

function appBase(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

export async function submitStayForm(
  _prev: StayFormResult | null,
  formData: FormData,
): Promise<StayFormResult> {
  await requireOperator();

  const intakeId = String(formData.get("intakeId") ?? "").trim() || null;
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const arrivalStr = String(formData.get("arrival") ?? "").trim();
  const departureStr = String(formData.get("departure") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const sendWelcome = formData.get("sendWelcome") === "on";

  const partyRaw = String(formData.get("partySize") ?? "").trim();
  const parsedParty = partyRaw ? Number.parseInt(partyRaw, 10) : NaN;
  const partySize = Number.isFinite(parsedParty) && parsedParty > 0 ? parsedParty : null;

  // Named errors — the form surfaces these verbatim (the QuoteForm pattern).
  if (!propertyId) return { ok: false, error: "Choose a property." };
  if (!arrivalStr) return { ok: false, error: "Choose an arrival date." };
  if (!departureStr) return { ok: false, error: "Choose a departure date." };
  if (!firstName) return { ok: false, error: "Guest first name is required." };
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return { ok: false, error: "That email doesn't look quite right." };
  }

  type TxOutcome =
    | { kind: "created"; created: Awaited<ReturnType<typeof createStayWithToken>> }
    | {
        kind: "existing"; // intake already converted — return its stay, don't re-create
        stayId: string;
        tokenId: string;
        guestFirstName: string;
        guestPhone: string | null;
        propertyName: string;
      };

  let outcome: TxOutcome;
  try {
    outcome = await prisma.$transaction(async (tx): Promise<TxOutcome> => {
      let intakeGuestId: string | null = null;
      let intakeInterestSlugs: string[] = [];

      if (intakeId) {
        // Idempotency claim: stamps convertedAt iff unclaimed AND unlinked.
        // Count 0 → already converted (or World-A linked) — double-click and
        // second-operator safe; a later failure rolls the claim back.
        const claimed = await tx.tripIntake.updateMany({
          where: { id: intakeId, convertedAt: null, stayId: null },
          data: { convertedAt: new Date() },
        });

        if (claimed.count === 0) {
          const existing = await tx.tripIntake.findUnique({
            where: { id: intakeId },
            include: {
              stay: {
                include: {
                  guest: true,
                  property: true,
                  accessTokens: { orderBy: { createdAt: "asc" }, take: 1 },
                },
              },
            },
          });
          const stay = existing?.stay;
          const token = stay?.accessTokens[0];
          if (!stay || !token) {
            throw new StayInputError(
              "This lead can't be converted right now — refresh the page.",
            );
          }
          return {
            kind: "existing",
            stayId: stay.id,
            tokenId: token.id,
            guestFirstName: stay.guest.firstName,
            guestPhone: stay.guest.phone,
            propertyName: stay.property.name,
          };
        }

        const intake = await tx.tripIntake.findUnique({ where: { id: intakeId } });
        if (!intake) throw new StayInputError("Intake not found.");
        intakeGuestId = intake.guestId; // post-stay return intents carry the guest
        intakeInterestSlugs = interestedSlugs(parseIntakeAnswers(intake.answersJson));
      }

      const created = await createStayWithToken(tx, {
        propertyId,
        arrivalDateStr: arrivalStr,
        departureDateStr: departureStr,
        partySize,
        guest: { guestId: intakeGuestId, firstName, lastName, email, phone },
        tokenLabel: intakeId ? "converted from intake" : "manual · ops",
      });

      if (intakeId) {
        await tx.tripIntake.update({
          where: { id: intakeId },
          data: { stayId: created.stay.id, guestId: created.guest.id },
        });
        // World B's signals enroll the moment the lead becomes a stay — the
        // guest opens their fresh link to a checklist already in motion.
        await enrollIntakeSignals(tx, created.stay, intakeInterestSlugs);
      }

      return { kind: "created", created };
    });
  } catch (err) {
    if (err instanceof StayInputError) return { ok: false, error: err.message };
    console.error("[ops] stay creation failed:", err);
    return { ok: false, error: "Something went wrong creating the stay — try again." };
  }

  if (outcome.kind === "existing") {
    const guestLink = `${appBase()}/t/${buildToken(outcome.tokenId)}`;
    return {
      ok: true,
      stayId: outcome.stayId,
      guestLink,
      guestFirstName: outcome.guestFirstName,
      guestPhone: outcome.guestPhone,
      propertyName: outcome.propertyName,
      smsMessage: guestLinkShareMessage({
        guestFirstName: outcome.guestFirstName,
        propertyName: outcome.propertyName,
        link: guestLink,
      }),
      emailLine: null, // already converted earlier — no fresh send to report
    };
  }

  const { stay, guest, property, tokenId } = outcome.created;
  const guestLink = `${appBase()}/t/${buildToken(tokenId)}`;

  // AFTER commit, never inside the tx: a send failure must not unwind the
  // creation — the panel reports send status honestly instead.
  let emailLine: string | null = null;
  if (sendWelcome) {
    const config = getGuestEmailConfig();
    if (!config.enabled) {
      emailLine = null; // toggle shouldn't have rendered; nothing to report
    } else if (!guest.email) {
      emailLine = "No welcome email — no email address on file.";
    } else {
      const result = await sendWelcomeEmail({ guest, stay, property, link: guestLink });
      if (result.sent) {
        // Touchpoint #1 of the cadence — recorded so the stay's Touchpoints
        // panel reads honestly and never offers a double-send. Best-effort:
        // the stay is already created and the email already sent, so a
        // touch-log failure must NOT throw and unwind that (the same invariant
        // the surrounding block keeps for the send itself). Worst case the
        // panel just re-offers the welcome — harmless next to a lost stay.
        try {
          await recordTouch({
            stayId: stay.id,
            kind: "WELCOME",
            channel: result.mode === "resend" ? "email" : result.mode,
            sentTo: result.to,
          });
        } catch (err) {
          console.error(
            "[ops] welcome touch-record failed (stay created + email sent):",
            err,
          );
        }
      }
      emailLine = result.sent
        ? result.mode === "resend"
          ? `Welcome email sent to ${result.to}.`
          : `Welcome email printed to the server console (RESEND_API_KEY unset).`
        : result.reason === "send-failed"
          ? "Welcome email failed to send — share the link another way."
          : null;
    }
  } else if (getGuestEmailConfig().enabled) {
    emailLine = "Welcome email not sent (toggle off).";
  }

  // Deliberately NO revalidatePath here: ANY revalidation re-renders the
  // current page in the action response, and on the convert page that flips
  // it into its CONVERTED branch — unmounting the form and dropping the fresh
  // panel (with the one-time email status line). Every surface this touches
  // is force-dynamic and Next 15 defaults staleTimes.dynamic to 0, so the
  // next navigation renders fresh state anyway.

  return {
    ok: true,
    stayId: stay.id,
    guestLink,
    guestFirstName: guest.firstName,
    guestPhone: guest.phone,
    propertyName: property.name,
    smsMessage: guestLinkShareMessage({
      guestFirstName: guest.firstName,
      propertyName: property.name,
      link: guestLink,
    }),
    emailLine,
  };
}
