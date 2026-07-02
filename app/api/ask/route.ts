import { NextRequest, NextResponse } from "next/server";
import { searchChunks, saveChatMessage, listChatMessages } from "../../../lib/db";
import { askGrounded } from "../../../lib/anthropic";

const RETRIEVE_K = 8;

type AskBody = {
  question?: string;
  session?: string;
};

/** Returns the chat history for a session (query param ?session=...). */
export async function GET(request: NextRequest) {
  const session = request.nextUrl.searchParams.get("session");
  if (!session) {
    return NextResponse.json({ error: "'session' is required" }, { status: 400 });
  }
  return NextResponse.json({ messages: await listChatMessages(session) });
}

export async function POST(request: NextRequest) {
  let body: AskBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const question = body.question?.trim();
  const session = body.session?.trim();
  if (!question || !session) {
    return NextResponse.json(
      { error: "'question' and 'session' are required" },
      { status: 400 }
    );
  }

  const chunks = await searchChunks(question, RETRIEVE_K);
  await saveChatMessage({ session, role: "user", content: question });

  let answer: string;
  let sources;
  try {
    const result = await askGrounded(question, chunks);
    answer = result.answer;
    sources = result.sources;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "The tutor is unavailable right now.";
    // Do not persist a failed assistant turn; surface a retryable error.
    return NextResponse.json(
      { error: `Could not get an answer: ${message}` },
      { status: 502 }
    );
  }

  await saveChatMessage({ session, role: "assistant", content: answer });

  return NextResponse.json({ answer, sources });
}
