import "server-only";
import type { Prisma } from "@prisma/client";
import { addDays, zonedDateTime } from "./dates";
import { generateTokenId } from "./tokens";
import { POST_STAY_ACCESS_DAYS } from "./stayPhase";

/**
 * The ONE stay-creation core — both ops entries (manual "New stay" and
 * convert-from-intake) run through here, and the future PMS feed calls the
 * same function. Runs inside an interactive prisma.$transaction so a failure
 * anywhere rolls the whole creation back (including a conversion claim).
 */

/** Operator-facing input problem — the action surfaces .message verbatim. */
export class StayInputError extends Error {}

export type CreateStayInput = {
  propertyId: string;
  /** "YYYY-MM-DD" wall-clock dates, interpreted in the property's timezone. */
  arrivalDateStr: string;
  departureDateStr: string;
  partySize: number | null;
  guest: {
    /** Explicit reuse (intake already linked to a Guest) — wins over email match. */
    guestId?: string | null;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
  tokenLabel: string;
};

export async function createStayWithToken(
  tx: Prisma.TransactionClient,
  input: CreateStayInput,
) {
  const property = await tx.property.findUnique({
    where: { id: input.propertyId },
    include: { partner: true },
  });
  if (!property) throw new StayInputError("Choose a property.");

  // Dates → instants at the property's check-in/check-out wall-clock times,
  // in the property's tz (the established rule; never naive new Date()).
  const arrivalDate = zonedDateTime(
    input.arrivalDateStr,
    property.checkInTime ?? "16:00",
    property.timezone,
  );
  const departureDate = zonedDateTime(
    input.departureDateStr,
    property.checkOutTime ?? "10:00",
    property.timezone,
  );
  if (Number.isNaN(arrivalDate.getTime()) || Number.isNaN(departureDate.getTime())) {
    throw new StayInputError("Couldn't read those dates — use the date pickers.");
  }
  if (departureDate.getTime() <= arrivalDate.getTime()) {
    throw new StayInputError("Departure must be after arrival.");
  }

  // Guest matching: explicit guestId → reuse. Else case-insensitive email
  // match → reuse. Either way FILL BLANKS ONLY, never overwrite (the
  // claimPerk precedent). Else create.
  let guest = input.guest.guestId
    ? await tx.guest.findUnique({ where: { id: input.guest.guestId } })
    : null;
  if (!guest && input.guest.email) {
    guest = await tx.guest.findFirst({
      where: { email: { equals: input.guest.email, mode: "insensitive" } },
    });
  }
  if (guest) {
    const fill: Prisma.GuestUpdateInput = {};
    if (!guest.lastName && input.guest.lastName) fill.lastName = input.guest.lastName;
    if (!guest.email && input.guest.email) fill.email = input.guest.email;
    if (!guest.phone && input.guest.phone) fill.phone = input.guest.phone;
    if (Object.keys(fill).length > 0) {
      guest = await tx.guest.update({ where: { id: guest.id }, data: fill });
    }
  } else {
    guest = await tx.guest.create({
      data: {
        firstName: input.guest.firstName,
        lastName: input.guest.lastName,
        email: input.guest.email,
        phone: input.guest.phone,
      },
    });
  }

  const stay = await tx.stay.create({
    data: {
      guestId: guest.id,
      propertyId: property.id,
      arrivalDate,
      departureDate,
      partySize: input.partySize,
      currency: "usd",
      isDemo: false,
    },
  });

  // First mint site that sets expiry — the link is a real ending 30 days
  // after departure. Demo/legacy null-expiry tokens are untouched.
  const tokenId = generateTokenId();
  await tx.accessToken.create({
    data: {
      id: tokenId,
      stayId: stay.id,
      label: input.tokenLabel,
      expiresAt: addDays(departureDate, POST_STAY_ACCESS_DAYS),
    },
  });

  return { stay, guest, property, tokenId };
}

/**
 * Enroll a set of interested service slugs as SIGNALED requests on a stay —
 * the demand-broker spine's intake door (Product Doctrine 2026-06-12).
 * World A calls this at /plan submission; World B at intake conversion.
 * Dedupes against the stay's open requests so re-planning never stacks
 * duplicates. Accepts a transaction client or the root client.
 */
export async function enrollIntakeSignals(
  tx: Prisma.TransactionClient,
  stay: { id: string; partySize: number | null },
  interestedServiceSlugs: string[],
): Promise<number> {
  if (interestedServiceSlugs.length === 0) return 0;

  const services = await tx.service.findMany({
    where: { slug: { in: interestedServiceSlugs }, isActive: true },
    select: { id: true },
  });
  if (services.length === 0) return 0;

  const open = await tx.serviceRequest.findMany({
    where: { stayId: stay.id, status: { in: ["SIGNALED", "READY", "QUOTED"] } },
    select: { serviceId: true },
  });
  const openIds = new Set(open.map((o) => o.serviceId));

  const toCreate = services.filter((s) => !openIds.has(s.id));
  if (toCreate.length === 0) return 0;

  await tx.serviceRequest.createMany({
    data: toCreate.map((s) => ({
      stayId: stay.id,
      serviceId: s.id,
      status: "SIGNALED" as const,
      source: "intake",
      partySize: stay.partySize ?? undefined,
    })),
  });
  return toCreate.length;
}

/** Warm one-liner the operator can text the guest — the link does the rest. */
export function guestLinkShareMessage(input: {
  guestFirstName: string;
  propertyName: string;
  link: string;
}): string {
  return `Hi ${input.guestFirstName} — your trip to ${input.propertyName} is all set. Everything for your stay, one tap away: ${input.link}`;
}
