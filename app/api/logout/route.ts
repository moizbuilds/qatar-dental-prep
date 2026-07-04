import { NextResponse } from "next/server";

const SESSION_COOKIE = "session";

// Clears the session cookie and returns to the login screen. POST-only so a
// prefetch or stray GET can't log the user out.
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0, // expire immediately
  });
  return response;
}
