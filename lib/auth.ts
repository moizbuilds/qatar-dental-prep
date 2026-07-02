import crypto from "node:crypto";

const SESSION_VALUE = "authenticated";

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
 * Produces a session cookie value: `<value>.<hmac>` where the HMAC is
 * keyed by SESSION_SECRET, so the cookie cannot be forged without the key.
 */
export function signSession(): string {
  const secret = getSessionSecret();
  const hmac = crypto.createHmac("sha256", secret).update(SESSION_VALUE).digest("hex");
  return `${SESSION_VALUE}.${hmac}`;
}

/**
 * Verifies a session cookie value produced by signSession(). Rejects
 * missing, malformed, or tampered values.
 */
export function verifySession(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;

  const separatorIndex = cookieValue.lastIndexOf(".");
  if (separatorIndex === -1) return false;

  const value = cookieValue.slice(0, separatorIndex);
  const providedHmac = cookieValue.slice(separatorIndex + 1);

  const secret = getSessionSecret();
  const expectedHmac = crypto.createHmac("sha256", secret).update(value).digest("hex");

  if (value !== SESSION_VALUE) return false;
  return timingSafeEqual(providedHmac, expectedHmac);
}
