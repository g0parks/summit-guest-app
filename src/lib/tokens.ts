// NOTE: server-only by nature — it reads SUMMIT_TOKEN_SECRET (a non-public env
// var, never bundled to the client). Kept free of `server-only` so the seed and
// CLI scripts (run via tsx, outside Next) can build/verify tokens too.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Per-guest access token = "<id>.<sig>"
 *   - id  : high-entropy random, the public lookup key (AccessToken.id in the DB)
 *   - sig : base64url( HMAC_SHA256(SUMMIT_TOKEN_SECRET, id) )
 *
 * The token is SIGNED (tamper-evident) and UNGUESSABLE (128-bit random id).
 * The DB never stores the secret or the signature — only the id. Verifying
 * recomputes the HMAC and constant-time compares, then the id is resolved
 * server-side to the Stay. Editing the id (e.g. to swap stays) breaks the sig.
 *
 * DOMAIN SEPARATION (load-bearing convention): three token families share
 * this one HMAC, told apart by payload shape —
 *   guest access  → raw base64url id (the alphabet CANNOT contain ":")
 *   unsubscribe   → "unsub:<guestId>"   (consent.ts)
 *   ops magic     → "ops:<expiryMs>"    (opsAuth.ts)
 * Every purpose-scoped verifier checks its own prefix, and resolveToken
 * (session.ts) rejects any id containing ":" so a purposed token can never
 * be replayed as a guest link. A NEW token purpose MUST take a "<purpose>:"
 * prefix — never a bare payload. (The wire format is frozen: changing the
 * MAC input would break every unsubscribe link already sitting in an inbox.)
 */

function getSecret(): string {
  const secret = process.env.SUMMIT_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SUMMIT_TOKEN_SECRET is missing or too short — set a long random value in .env",
    );
  }
  return secret;
}

function sign(id: string): string {
  return createHmac("sha256", getSecret()).update(id).digest("base64url");
}

/** Generate a fresh, unguessable token id (store this as AccessToken.id). */
export function generateTokenId(): string {
  return randomBytes(16).toString("base64url");
}

/** Build the full signed token string to put in the guest link. */
export function buildToken(id: string): string {
  return `${id}.${sign(id)}`;
}

/**
 * Verify a token string. Returns the embedded id if the signature is valid,
 * otherwise null. Does NOT hit the DB — purely cryptographic.
 */
export function verifyToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const id = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = sign(id);

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return id;
}
