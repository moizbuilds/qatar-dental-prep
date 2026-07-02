import { NextRequest, NextResponse } from "next/server";
import { verifyPasscode, signSession } from "@/lib/auth";

const SESSION_COOKIE = "session";
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Global bucket: ALL login attempts on this process share one counter.
// This is what actually stops brute-forcing, since the app is single-user
// and single-instance — an attacker gains nothing by rotating IPs/headers.
const GLOBAL_RATE_LIMIT_KEY = "__global__";

// Simple in-memory rate limit, keyed by bucket key. Resets on process
// restart, which is fine for a single-instance, single-user app.
const attempts = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (attempts.get(key) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    attempts.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  attempts.set(key, timestamps);
  return false;
}

// Per-IP key is only trusted from X-Forwarded-For when TRUST_PROXY=1 is
// set, i.e. when the app is known to run behind a trusted reverse proxy
// that sets/overwrites this header. Without that env var, the header is
// client-controlled and trusting it lets an attacker get a fresh bucket
// on every request, so we fall back to a fixed key (making every request
// share one per-IP bucket too, on top of the global bucket).
function getClientKey(request: NextRequest): string {
  if (process.env.TRUST_PROXY === "1") {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0].trim();
    }
  }
  return "unknown";
}

export async function POST(request: NextRequest) {
  const key = getClientKey(request);

  // Global bucket first: this is the one that can't be bypassed by
  // spoofing headers. Per-IP bucket is additional, defense-in-depth for
  // when TRUST_PROXY=1 is correctly configured behind a real proxy.
  if (isRateLimited(GLOBAL_RATE_LIMIT_KEY) || isRateLimited(key)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  let passcode: string | undefined;
  try {
    const body = await request.json();
    passcode = body?.passcode;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof passcode !== "string" || !verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, signSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
