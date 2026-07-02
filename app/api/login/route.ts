import { NextRequest, NextResponse } from "next/server";
import { verifyPasscode, signSession } from "@/lib/auth";

const SESSION_COOKIE = "session";
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Simple in-memory rate limit, keyed by client IP. Resets on process restart,
// which is fine for a single-instance, single-user app.
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

function getClientKey(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  );
}

export async function POST(request: NextRequest) {
  const key = getClientKey(request);

  if (isRateLimited(key)) {
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
