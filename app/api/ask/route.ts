import { NextRequest, NextResponse } from "next/server";
import { searchChunks, saveChatMessage, listChatMessages } from "../../../lib/db";
import { askGrounded, type PriorTurn } from "../../../lib/anthropic";

const RETRIEVE_K = 8;
const MAX_QUESTION_LENGTH = 2000; // guards against oversized prompts / cost
const HISTORY_TURNS = 8; // recent turns handed to Claude for follow-up context

// Minimal in-memory rate limit so a leaked (30-day) session cookie can't run
// up unbounded Anthropic spend. Per-process, resets on restart — matching the
// login limiter's model; fine for a single-user, single-instance app.
const ASK_RATE_LIMIT = 15;
const ASK_RATE_WINDOW_MS = 60_000;
const askHits: number[] = [];

function askRateLimited(): boolean {
  const now = Date.now();
  while (askHits.length && now - askHits[0] > ASK_RATE_WINDOW_MS) askHits.shift();
  if (askHits.length >= ASK_RATE_LIMIT) return true;
  askHits.push(now);
  return false;
}

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
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `Question is too long (max ${MAX_QUESTION_LENGTH} characters).` },
      { status: 400 }
    );
  }
  if (askRateLimited()) {
    return NextResponse.json(
      { error: "Too many questions in a short time. Please wait a moment." },
      { status: 429 }
    );
  }

  // Prior turns for this session, used both as Claude's conversation context
  // and to sharpen retrieval on follow-ups. Fetched BEFORE we persist the new
  // turn, so history holds only earlier messages.
  const priorMessages = await listChatMessages(session);
  const history: PriorTurn[] = priorMessages
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content }));

  // A bare follow-up ("what about in children?") retrieves badly on its own, so
  // prepend the previous user turn to the retrieval query for better recall.
  const lastUserTurn = [...priorMessages].reverse().find((m) => m.role === "user");
  const retrievalQuery = lastUserTurn ? `${lastUserTurn.content}\n${question}` : question;
  const chunks = await searchChunks(retrievalQuery, RETRIEVE_K);

  let answer: string;
  let sources;
  try {
    const result = await askGrounded(question, chunks, history);
    answer = result.answer;
    sources = result.sources;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "The tutor is unavailable right now.";
    // Persist nothing on failure — no dangling user turn to orphan history.
    return NextResponse.json(
      { error: `Could not get an answer: ${message}` },
      { status: 502 }
    );
  }

  // Persist both turns only after a successful answer.
  await saveChatMessage({ session, role: "user", content: question });
  await saveChatMessage({ session, role: "assistant", content: answer });

  return NextResponse.json({ answer, sources });
}
