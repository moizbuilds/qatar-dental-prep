-- Qatar Dental Prep — SQLite schema
-- Applied by scripts/init-db.ts. Keep all DDL here; no raw SQL outside lib/db/*.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Source-material chunks extracted from the reference books (pipeline/output/chunks.jsonl).
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  book TEXT NOT NULL,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  category_hint TEXT NOT NULL,
  text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_category_hint ON chunks (category_hint);

-- FTS5 full-text index over chunk text, kept in sync via triggers below.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5 (
  text,
  content = 'chunks',
  content_rowid = 'rowid'
);

CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts (rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO chunks_fts (rowid, text) VALUES (new.rowid, new.text);
END;

-- Authored exam-style questions (Task 4 populates these).
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  stem TEXT NOT NULL,
  choices TEXT NOT NULL,        -- JSON array of choice strings
  correct_index INTEGER NOT NULL,
  explanation TEXT,
  source_chunk_id TEXT REFERENCES chunks (id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_questions_category ON questions (category);

-- One row per mock-exam / quiz attempt.
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- One row per answered question within an attempt.
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES quiz_attempts (id),
  question_id INTEGER NOT NULL REFERENCES questions (id),
  selected_index INTEGER NOT NULL,
  is_correct INTEGER NOT NULL,  -- 0/1
  answered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_answers_attempt_id ON answers (attempt_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers (question_id);

-- Ask-mode chat history, grouped by session id.
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session TEXT NOT NULL,
  role TEXT NOT NULL,           -- 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session);
