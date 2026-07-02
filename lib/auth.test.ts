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
});
