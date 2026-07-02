import crypto from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyPasscode, signSession, verifySession } from "./auth";

const ORIGINAL_PASSCODE = process.env.APP_PASSCODE;
const ORIGINAL_SECRET = process.env.SESSION_SECRET;

beforeEach(() => {
  process.env.APP_PASSCODE = "test-passcode-123";
  process.env.SESSION_SECRET = "test-session-secret-abc";
});

afterEach(() => {
  process.env.APP_PASSCODE = ORIGINAL_PASSCODE;
  process.env.SESSION_SECRET = ORIGINAL_SECRET;
});

describe("verifyPasscode", () => {
  it("returns true when input matches APP_PASSCODE", () => {
    expect(verifyPasscode("test-passcode-123")).toBe(true);
  });

  it("returns false when input does not match APP_PASSCODE", () => {
    expect(verifyPasscode("wrong-passcode")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(verifyPasscode("")).toBe(false);
  });
});

describe("signSession / verifySession", () => {
  it("round-trips: verifySession(signSession()) is true", () => {
    const cookie = signSession();
    expect(verifySession(cookie)).toBe(true);
  });

  it("rejects a tampered cookie value", () => {
    const cookie = signSession();
    const tampered = cookie.slice(0, -1) + (cookie.slice(-1) === "a" ? "b" : "a");
    expect(verifySession(tampered)).toBe(false);
  });

  it("rejects a garbage cookie value", () => {
    expect(verifySession("not-a-real-session-value")).toBe(false);
  });

  it("rejects an undefined cookie value", () => {
    expect(verifySession(undefined)).toBe(false);
  });

  it("rejects an empty string cookie value", () => {
    expect(verifySession("")).toBe(false);
  });

  it("accepts a freshly signed session (not expired)", () => {
    const cookie = signSession();
    expect(verifySession(cookie)).toBe(true);
  });

  it("rejects an expired token, even with a correct HMAC signature", () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 60; // 60s in the past
    const expiryStr = String(pastExpiry);
    const hmac = crypto
      .createHmac("sha256", process.env.SESSION_SECRET as string)
      .update(expiryStr)
      .digest("hex");
    const expiredCookie = `${expiryStr}.${hmac}`;
    expect(verifySession(expiredCookie)).toBe(false);
  });

  it("accepts a token with a correctly signed future expiry", () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 60; // 60s from now
    const expiryStr = String(futureExpiry);
    const hmac = crypto
      .createHmac("sha256", process.env.SESSION_SECRET as string)
      .update(expiryStr)
      .digest("hex");
    const validCookie = `${expiryStr}.${hmac}`;
    expect(verifySession(validCookie)).toBe(true);
  });

  it("rejects a token with a tampered expiry (HMAC no longer matches)", () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 60;
    const expiryStr = String(futureExpiry);
    const hmac = crypto
      .createHmac("sha256", process.env.SESSION_SECRET as string)
      .update(expiryStr)
      .digest("hex");
    // Bump the expiry after signing, so the HMAC no longer matches.
    const tamperedExpiryStr = String(futureExpiry + 1000);
    const tamperedCookie = `${tamperedExpiryStr}.${hmac}`;
    expect(verifySession(tamperedCookie)).toBe(false);
  });

  it("rejects a malformed cookie missing the separator", () => {
    expect(verifySession("no-dot-here")).toBe(false);
  });
});
