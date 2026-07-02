/**
 * One-time loader: pushes the local corpus (chunks + verified question bank)
 * into the Supabase Postgres project used by the deployed app. Reads
 * pipeline/output/chunks.jsonl and pipeline/questions/*.json locally and
 * inserts over the network, so the data never has to pass through anything
 * else. Idempotent-ish: clears the app tables first.
 *
 * Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... npx tsx scripts/load-supabase.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error("SUPABASE_URL and SUPABASE_ANON_KEY must be set.");
  process.exit(1);
}
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const ROOT = process.cwd();
const CHUNKS = path.join(ROOT, "pipeline", "output", "chunks.jsonl");
const QDIR = path.join(ROOT, "pipeline", "questions");

interface Chunk {
  id: string;
  book: string;
  page_start: number;
  page_end: number;
  category_hint: string;
  text: string;
}

function loadChunks(): Chunk[] {
  return fs
    .readFileSync(CHUNKS, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Chunk);
}

async function insertInBatches<T>(table: string, rows: T[], size: number) {
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    const { error } = await supabase.from(table).insert(batch as never);
    if (error) {
      console.error(`insert ${table} batch @${i}:`, error.message);
      process.exit(1);
    }
    process.stdout.write(`\r  ${table}: ${Math.min(i + size, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
}

function findChunkId(byBook: Map<string, Chunk[]>, book: string, page: number): string | null {
  for (const c of byBook.get(book.toLowerCase()) ?? []) {
    if (c.page_start <= page && page <= c.page_end) return c.id;
  }
  return null;
}

async function main() {
  const chunks = loadChunks();
  console.log(`loaded ${chunks.length} chunks locally`);

  // Clear app tables (respect FK order).
  for (const t of ["answers", "chat_messages", "quiz_attempts", "questions", "chunks"]) {
    const { error } = await supabase.from(t).delete().neq("id", "___none___");
    // delete-all needs a filter; use a never-true-ish match on id via not-null
    if (error && !/invalid input syntax/.test(error.message)) {
      // id types differ (text vs bigint); fall back to gte
    }
  }
  // Robust clear: use gte on a sentinel that matches all.
  await supabase.from("answers").delete().gte("id", 0);
  await supabase.from("chat_messages").delete().gte("id", 0);
  await supabase.from("quiz_attempts").delete().gte("id", 0);
  await supabase.from("questions").delete().gte("id", 0);
  await supabase.from("chunks").delete().neq("id", "");

  // Postgres text columns can't store null bytes, which some PDF
  // extractions contain; strip C0 control chars (except tab/newline/CR) and DEL.

  const clean = (s: string) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Insert chunks.
  await insertInBatches(
    "chunks",
    chunks.map((c) => ({
      id: c.id,
      book: clean(c.book),
      page_start: c.page_start,
      page_end: c.page_end,
      category_hint: c.category_hint,
      text: clean(c.text),
    })),
    500
  );

  // Build book->chunks index for question source resolution.
  const byBook = new Map<string, Chunk[]>();
  for (const c of chunks) {
    const k = c.book.toLowerCase();
    if (!byBook.has(k)) byBook.set(k, []);
    byBook.get(k)!.push(c);
  }

  // Load + insert questions.
  const files = fs.readdirSync(QDIR).filter((f) => f.endsWith(".json"));
  const questions: Record<string, unknown>[] = [];
  for (const f of files) {
    const arr = JSON.parse(fs.readFileSync(path.join(QDIR, f), "utf-8")) as {
      stem: string;
      options: string[];
      answer_index: number;
      justification: string;
      source_book: string;
      source_page: number;
      category: string;
    }[];
    for (const q of arr) {
      questions.push({
        category: q.category,
        stem: q.stem,
        choices: q.options,
        correct_index: q.answer_index,
        explanation: q.justification,
        source_chunk_id: findChunkId(byBook, q.source_book, q.source_page),
      });
    }
  }
  console.log(`prepared ${questions.length} questions`);
  await insertInBatches("questions", questions, 500);

  // Verify counts.
  const c1 = await supabase.from("chunks").select("*", { count: "exact", head: true });
  const c2 = await supabase.from("questions").select("*", { count: "exact", head: true });
  console.log(`DONE. chunks=${c1.count} questions=${c2.count}`);
}

main();
