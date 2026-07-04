import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import {
  BLUEPRINT,
  GRADED_MODES,
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

// SQL fragment: the set of attempt modes that count toward the dashboard.
// Built from GRADED_MODES so the two can't drift apart.
const GRADED_MODES_SQL = GRADED_MODES.map((m) => `'${m}'`).join(", ");

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "app.db");
// Resolve from the project root (process.cwd()), not __dirname: under the
// Next.js/Turbopack server bundle __dirname becomes a virtual path like
// /ROOT/lib/db and fs.readFileSync fails with ENOENT. cwd is the project
// root in dev, `next start`, tests, and the db scripts alike.
const SCHEMA_PATH = path.join(process.cwd(), "lib", "db", "schema.sql");

let dbInstance: Database.Database | null = null;

function applySchemaIfNeeded(database: Database.Database) {
  const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
  database.exec(schema);
}

/**
 * Returns the singleton better-sqlite3 Database instance, opening and
 * initializing it (applying schema.sql) on first use.
 */
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbDir = path.dirname(DEFAULT_DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const database = new Database(DEFAULT_DB_PATH);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  applySchemaIfNeeded(database);

  dbInstance = database;
  return dbInstance;
}

/** Test-only hook: inject a pre-built Database (e.g. temp file or in-memory) in place of the singleton. */
export function _setDbForTests(database: Database.Database): void {
  dbInstance = database;
}

/** Test-only hook: clear the injected/singleton instance so the next getDb() call re-opens the default DB. */
export function _resetDbForTests(): void {
  dbInstance = null;
}

// ---------------------------------------------------------------------------
// Chunks / full-text search
// ---------------------------------------------------------------------------

// Common English words that carry no retrieval signal. Dropping them stops a
// question like "how is a pulpotomy performed" from matching every chunk that
// merely contains "how"/"is"/"a". Kept small on purpose — mirror this list in
// the Supabase search_chunks RPC (which uses websearch_to_tsquery natively).
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "of", "to", "in", "on", "at", "for", "and", "or", "with", "how", "what",
  "which", "who", "whom", "that", "this", "these", "those", "do", "does",
  "did", "can", "could", "should", "would", "it", "its", "as", "by", "from",
]);

/**
 * Sanitizes a free-text user query into a safe FTS5 MATCH expression.
 * Extracts word-like tokens, drops stopwords, double-quotes each remaining
 * token (escaping embedded quotes) to neutralize FTS5 operators/punctuation,
 * then joins with OR so any queried term can match. Falls back to the raw
 * tokens if every token was a stopword, so a query is never emptied entirely.
 */
function toFtsQuery(query: string): string {
  const tokens = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length === 0) return "";
  const meaningful = tokens.filter((t) => !STOPWORDS.has(t.toLowerCase()));
  const chosen = meaningful.length > 0 ? meaningful : tokens;
  return chosen.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");
}

/**
 * Bulk-inserts chunk rows (used by scripts/load-chunks.ts). Runs inside a
 * single transaction and upserts on id so re-running the loader is safe.
 * The chunks_fts triggers in schema.sql keep the FTS index in sync.
 */
export function insertChunks(chunks: Chunk[]): number {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO chunks (id, book, page_start, page_end, category_hint, text)
     VALUES (@id, @book, @page_start, @page_end, @category_hint, @text)
     ON CONFLICT (id) DO UPDATE SET
       book = excluded.book,
       page_start = excluded.page_start,
       page_end = excluded.page_end,
       category_hint = excluded.category_hint,
       text = excluded.text`
  );

  const insertMany = db.transaction((rows: Chunk[]) => {
    for (const row of rows) insert.run(row);
    return rows.length;
  });

  return insertMany(chunks);
}

export function getChunkById(id: string): Chunk | undefined {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, book, page_start, page_end, category_hint, text FROM chunks WHERE id = ?`
    )
    .get(id) as Chunk | undefined;
  return row;
}

export function searchChunks(query: string, limit: number): Chunk[] {
  const ftsQuery = toFtsQuery(query);
  if (!ftsQuery) return [];

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id, c.book, c.page_start, c.page_end, c.category_hint, c.text
       FROM chunks_fts
       JOIN chunks c ON c.rowid = chunks_fts.rowid
       WHERE chunks_fts MATCH ?
       ORDER BY bm25(chunks_fts)
       LIMIT ?`
    )
    .all(ftsQuery, limit) as Chunk[];

  return rows;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

interface QuestionRow {
  id: number;
  category: string;
  stem: string;
  choices: string;
  correct_index: number;
  explanation: string | null;
  source_chunk_id: string | null;
  created_at: string;
}

function rowToQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    category: row.category as BlueprintCategory,
    stem: row.stem,
    choices: JSON.parse(row.choices) as string[],
    correct_index: row.correct_index,
    explanation: row.explanation,
    source_chunk_id: row.source_chunk_id,
    created_at: row.created_at,
  };
}

export function insertQuestion(q: NewQuestion): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO questions (category, stem, choices, correct_index, explanation, source_chunk_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      q.category,
      q.stem,
      JSON.stringify(q.choices),
      q.correct_index,
      q.explanation ?? null,
      q.source_chunk_id ?? null
    );
  return Number(result.lastInsertRowid);
}

export function listQuestions(filter: QuestionFilter = {}): Question[] {
  const db = getDb();
  let sql = "SELECT * FROM questions";
  const params: unknown[] = [];

  if (filter.category) {
    sql += " WHERE category = ?";
    params.push(filter.category);
  }

  sql += " ORDER BY id ASC";

  if (filter.limit) {
    sql += " LIMIT ?";
    params.push(filter.limit);
  }

  const rows = db.prepare(sql).all(...params) as QuestionRow[];
  return rows.map(rowToQuestion);
}

export function getQuestionById(id: number): Question | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM questions WHERE id = ?`).get(id) as
    | QuestionRow
    | undefined;
  return row ? rowToQuestion(row) : undefined;
}

export function getQuestionsByCategory(cat: BlueprintCategory, n: number): Question[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM questions WHERE category = ? ORDER BY RANDOM() LIMIT ?`)
    .all(cat, n) as QuestionRow[];
  return rows.map(rowToQuestion);
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Builds a full 150-question mock exam distributed per BLUEPRINT's
 * per-category exam counts. If a category has fewer questions available
 * than its blueprint count, logs the shortfall via console.warn and
 * includes whatever is available for that category (degrades gracefully
 * rather than throwing).
 */
export function randomMock(): Question[] {
  const selected: Question[] = [];

  for (const { category, examCount } of BLUEPRINT) {
    const available = getQuestionsByCategory(category, examCount);
    if (available.length < examCount) {
      console.warn(
        `[randomMock] shortfall in category "${category}": needed ${examCount}, found ${available.length}`
      );
    }
    selected.push(...available);
  }

  return shuffle(selected);
}

// ---------------------------------------------------------------------------
// Attempts / answers
// ---------------------------------------------------------------------------

export function createAttempt(mode: QuizMode = "full"): number {
  const db = getDb();
  const result = db.prepare(`INSERT INTO quiz_attempts (mode) VALUES (?)`).run(mode);
  return Number(result.lastInsertRowid);
}

export function recordAnswer(a: NewAnswer): void {
  const db = getDb();
  // Upsert on (attempt_id, question_id): re-answering the same question in the
  // same attempt (e.g. after a page reload) overwrites the prior row rather
  // than adding a duplicate that would inflate the attempt's total.
  db.prepare(
    `INSERT INTO answers (attempt_id, question_id, selected_index, is_correct)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (attempt_id, question_id) DO UPDATE SET
       selected_index = excluded.selected_index,
       is_correct = excluded.is_correct,
       answered_at = datetime('now')`
  ).run(a.attempt_id, a.question_id, a.selected_index, a.is_correct ? 1 : 0);
}

export function getAttemptScore(attemptId: number): { correct: number; total: number } {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(is_correct), 0) AS correct
       FROM answers
       WHERE attempt_id = ?`
    )
    .get(attemptId) as { total: number; correct: number };
  return { correct: row.correct, total: row.total };
}

/** True if a quiz attempt with this id exists. */
export function attemptExists(attemptId: number): boolean {
  const db = getDb();
  return db.prepare(`SELECT 1 FROM quiz_attempts WHERE id = ?`).get(attemptId) !== undefined;
}

/** Marks an attempt finished by stamping completed_at (idempotent). */
export function completeAttempt(attemptId: number): void {
  const db = getDb();
  db.prepare(`UPDATE quiz_attempts SET completed_at = datetime('now') WHERE id = ?`).run(attemptId);
}

/**
 * Per-attempt scores ordered oldest-first, for the dashboard trend line.
 * Only counts attempts that have at least one recorded answer.
 */
export function attemptHistory(): AttemptScore[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT qa.id AS attempt_id,
              qa.completed_at AS completed_at,
              COUNT(a.id) AS total,
              COALESCE(SUM(a.is_correct), 0) AS correct
       FROM quiz_attempts qa
       JOIN answers a ON a.attempt_id = qa.id
       WHERE qa.mode IN (${GRADED_MODES_SQL})
         AND qa.completed_at IS NOT NULL
       GROUP BY qa.id
       ORDER BY qa.id ASC`
    )
    .all() as {
    attempt_id: number;
    completed_at: string | null;
    total: number;
    correct: number;
  }[];

  return rows.map((row) => ({
    attempt_id: row.attempt_id,
    completed_at: row.completed_at,
    total: row.total,
    correct: row.correct,
    pct: row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0,
  }));
}

export function attemptStats(): CategoryStat[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT q.category AS category,
              COUNT(*) AS attempted,
              SUM(a.is_correct) AS correct
       FROM answers a
       JOIN questions q ON q.id = a.question_id
       JOIN quiz_attempts qa ON qa.id = a.attempt_id
       WHERE qa.mode IN (${GRADED_MODES_SQL})
       GROUP BY q.category`
    )
    .all() as { category: string; attempted: number; correct: number | null }[];

  return rows.map((row) => {
    const correct = row.correct ?? 0;
    return {
      category: row.category as BlueprintCategory,
      attempted: row.attempted,
      correct,
      accuracy: row.attempted > 0 ? correct / row.attempted : 0,
    };
  });
}

export function missedQuestions(): Question[] {
  const db = getDb();
  // Return questions whose MOST RECENT answer (across all attempts) is wrong.
  // Using the latest answer — not "ever wrong" — means answering a question
  // correctly in review removes it from the list, so the set actually shrinks
  // as you improve.
  const rows = db
    .prepare(
      `SELECT q.*
       FROM questions q
       JOIN (
         SELECT a.question_id, a.is_correct,
                ROW_NUMBER() OVER (
                  PARTITION BY a.question_id
                  ORDER BY a.answered_at DESC, a.id DESC
                ) AS rn
         FROM answers a
       ) latest ON latest.question_id = q.id AND latest.rn = 1
       WHERE latest.is_correct = 0`
    )
    .all() as QuestionRow[];
  return rows.map(rowToQuestion);
}

export function completedQuestions(): Question[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT q.*
       FROM answers a
       JOIN questions q ON q.id = a.question_id`
    )
    .all() as QuestionRow[];
  return rows.map(rowToQuestion);
}

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------

export function saveChatMessage(m: NewChatMessage): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO chat_messages (session, role, content) VALUES (?, ?, ?)`
  ).run(m.session, m.role, m.content);
}

export function listChatMessages(session: string): ChatMessage[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM chat_messages WHERE session = ? ORDER BY id ASC`)
    .all(session) as ChatMessage[];
  return rows;
}
