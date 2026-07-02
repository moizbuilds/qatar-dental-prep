import { NextRequest, NextResponse } from "next/server";
import { getAttemptScore, completeAttempt } from "../../../../lib/db";

const PASS_THRESHOLD_PERCENT = 60;

type FinishBody = {
  attemptId?: number;
};

export async function POST(request: NextRequest) {
  let body: FinishBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { attemptId } = body;
  if (typeof attemptId !== "number") {
    return NextResponse.json({ error: "'attemptId' is required" }, { status: 400 });
  }

  const { correct, total } = await getAttemptScore(attemptId);
  await completeAttempt(attemptId);
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  const passed = percentage >= PASS_THRESHOLD_PERCENT;

  return NextResponse.json({ correct, total, percentage, passed });
}
