import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  type AttemptScore,
  type BlueprintCategory,
  type CategoryStat,
  type ChatMessage,
  type Chunk,
  type NewAnswer,
  type NewChatMessage,
  type NewQuestion,
  type Question,
  type QuestionFilter,
  type QuizMode,
} from "./types";

let cached: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

interface QuestionRow {
  id: number;
  category: string;
  stem: string;
  choices: string[];
  correct_index: number;
  explanation: string | null;
  source_chunk_id: string | null;
  created_at: string;
}

function toQuestion(r: QuestionRow): Question {
  return {
    id: Number(r.id),
    category: r.category as BlueprintCategory,
    stem: r.stem,
    choices: r.choices,
    correct_index: r.correct_index,
    explanation: r.explanation,
    source_chunk_id: r.source_chunk_id,
    created_at: r.created_at,
  };
}

const CHUNK_COLS = "id,book,page_start,page_end,category_hint,text";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- Chunks / search ---

export async function searchChunks(query: string, limit: number): Promise<Chunk[]> {
  // Parity with the SQLite backend: a query with no word-like tokens (empty or
  // punctuation-only) retrieves nothing rather than erroring in the RPC.
  if (!/[\p{L}\p{N}]/u.test(query)) return [];
  const data = must(await db().rpc("search_chunks", { q: query, k: limit }));
  return (data as Chunk[]).map((c) => ({
    id: c.id,
    book: c.book,
    page_start: c.page_start,
    page_end: c.page_end,
    category_hint: c.category_hint,
    text: c.text,
  }));
}

export async function getChunkById(id: string): Promise<Chunk | undefined> {
  const data = must(await db().from("chunks").select(CHUNK_COLS).eq("id", id).maybeSingle());
  return (data as Chunk | null) ?? undefined;
}

// --- Questions ---

export async function insertQuestion(q: NewQuestion): Promise<number> {
  const data = must(await db().from("questions").insert(q).select("id").single());
  return Number((data as unknown as { id: number }).id);
}

export async function listQuestions(filter: QuestionFilter = {}): Promise<Question[]> {
  let q = db().from("questions").select("*").order("id", { ascending: true });
  if (filter.category) q = q.eq("category", filter.category);
  if (filter.limit) q = q.limit(filter.limit);
  const data = must(await q);
  return (data as QuestionRow[]).map(toQuestion);
}

export async function getQuestionsByCategory(
  cat: BlueprintCategory,
  n: number
): Promise<Question[]> {
  const data = must(await db().rpc("questions_by_category", { cat, n }));
  return (data as QuestionRow[]).map(toQuestion);
}

export async function randomMock(): Promise<Question[]> {
  // One round-trip: the random_mock RPC applies the blueprint weighting
  // server-side (was 14 sequential category RPCs — a slow full-mock start).
  const data = must(await db().rpc("random_mock"));
  return shuffle((data as QuestionRow[]).map(toQuestion));
}

export async function getQuestionById(id: number): Promise<Question | undefined> {
  const data = must(await db().from("questions").select("*").eq("id", id).maybeSingle());
  return data ? toQuestion(data as QuestionRow) : undefined;
}

// --- Attempts / answers ---

export async function createAttempt(mode: QuizMode = "full"): Promise<number> {
  const data = must(await db().from("quiz_attempts").insert({ mode }).select("id").single());
  return Number((data as unknown as { id: number }).id);
}

export async function recordAnswer(a: NewAnswer): Promise<void> {
  // Upsert on (attempt_id, question_id) — mirrors the SQLite backend so a
  // re-answered question (e.g. after a reload) doesn't create a duplicate row.
  // Requires the UNIQUE(attempt_id, question_id) constraint (see migrations).
  const { error } = await db()
    .from("answers")
    .upsert(
      {
        attempt_id: a.attempt_id,
        question_id: a.question_id,
        selected_index: a.selected_index,
        is_correct: a.is_correct,
        answered_at: new Date().toISOString(),
      },
      { onConflict: "attempt_id,question_id" }
    );
  if (error) throw new Error(error.message);
}

export async function attemptExists(attemptId: number): Promise<boolean> {
  const res = await db()
    .from("quiz_attempts")
    .select("id", { head: true, count: "exact" })
    .eq("id", attemptId);
  if (res.error) throw new Error(res.error.message);
  return (res.count ?? 0) > 0;
}

export async function completeAttempt(attemptId: number): Promise<void> {
  const { error } = await db()
    .from("quiz_attempts")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", attemptId);
  if (error) throw new Error(error.message);
}

export async function getAttemptScore(
  attemptId: number
): Promise<{ correct: number; total: number }> {
  const data = must(await db().rpc("get_attempt_score", { aid: attemptId }));
  const row = (data as { total: number; correct: number }[])[0] ?? { total: 0, correct: 0 };
  return { correct: Number(row.correct), total: Number(row.total) };
}

export async function attemptStats(): Promise<CategoryStat[]> {
  const data = must(await db().rpc("attempt_stats"));
  return (data as { category: string; attempted: number; correct: number }[]).map((r) => {
    const attempted = Number(r.attempted);
    const correct = Number(r.correct);
    return {
      category: r.category as BlueprintCategory,
      attempted,
      correct,
      accuracy: attempted > 0 ? correct / attempted : 0,
    };
  });
}

export async function attemptHistory(): Promise<AttemptScore[]> {
  const data = must(await db().rpc("attempt_history"));
  return (
    data as { attempt_id: number; completed_at: string | null; total: number; correct: number }[]
  ).map((r) => {
    const total = Number(r.total);
    const correct = Number(r.correct);
    return {
      attempt_id: Number(r.attempt_id),
      completed_at: r.completed_at,
      total,
      correct,
      pct: total > 0 ? Math.round((correct / total) * 100) : 0,
    };
  });
}

export async function missedQuestions(): Promise<Question[]> {
  const data = must(await db().rpc("missed_questions"));
  return (data as QuestionRow[]).map(toQuestion);
}

export async function completedQuestions(): Promise<Question[]> {
  const data = must(await db().rpc("completed_questions"));
  return (data as QuestionRow[]).map(toQuestion);
}

// --- Chat ---

export async function saveChatMessage(m: NewChatMessage): Promise<void> {
  const { error } = await db()
    .from("chat_messages")
    .insert({ session: m.session, role: m.role, content: m.content });
  if (error) throw new Error(error.message);
}

export async function listChatMessages(session: string): Promise<ChatMessage[]> {
  const data = must(
    await db().from("chat_messages").select("*").eq("session", session).order("id", { ascending: true })
  );
  return data as ChatMessage[];
}
