import crypto from "node:crypto";

// Session lifetime: how long a signed-in session stays valid before the
// user must re-enter the passcode.
const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60; // 30 days

function getPasscode(): string {
  return process.env.APP_PASSCODE ?? "";
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? "";
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still run a comparison against a same-length buffer to avoid
    // leaking length information via early return timing.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Constant-time comparison of the given input against APP_PASSCODE.
 */
export function verifyPasscode(input: string): boolean {
  const passcode = getPasscode();
  if (!passcode || !input) return false;
  return timingSafeEqual(input, passcode);
}

/**
 * Produces a session cookie value: `<expiryEpochSeconds>.<hmac>` where the
 * HMAC is keyed by SESSION_SECRET over the expiry string, so the cookie
 * cannot be forged or extended without the key, and it stops being valid
 * once the expiry timestamp has passed.
 */
export function signSession(): string {
  const secret = getSessionSecret();
  const expiry = Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS;
  const expiryStr = String(expiry);
  const hmac = crypto.createHmac("sha256", secret).update(expiryStr).digest("hex");
  return `${expiryStr}.${hmac}`;
}

/**
 * Verifies a session cookie value produced by signSession(). Rejects
 * missing, malformed, tampered, or expired values.
 */
export function verifySession(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;

  const separatorIndex = cookieValue.lastIndexOf(".");
  if (separatorIndex === -1) return false;

  const expiryStr = cookieValue.slice(0, separatorIndex);
  const providedHmac = cookieValue.slice(separatorIndex + 1);

  if (!/^\d+$/.test(expiryStr)) return false;

  const secret = getSessionSecret();
  const expectedHmac = crypto.createHmac("sha256", secret).update(expiryStr).digest("hex");

  if (!timingSafeEqual(providedHmac, expectedHmac)) return false;

  const expiry = Number(expiryStr);
  const now = Math.floor(Date.now() / 1000);
  return expiry > now;
}
