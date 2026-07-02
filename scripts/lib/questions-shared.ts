// Shared types + pure logic for authoring-question verification and loading.
// Used by scripts/verify-questions.ts, scripts/load-questions.ts, and their tests.

import fs from "node:fs";
import path from "node:path";
import type { BlueprintCategory, Chunk } from "../../lib/db/types";
import { BLUEPRINT } from "../../lib/db/types";

export const QUESTIONS_DIR = path.join(process.cwd(), "pipeline", "questions");
export const CHUNKS_PATH = path.join(process.cwd(), "pipeline", "output", "chunks.jsonl");

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const CATEGORIES: readonly BlueprintCategory[] = BLUEPRINT.map((b) => b.category);

/** Shape of one authored question as stored in pipeline/questions/<category>.json. */
export interface AuthoredQuestion {
  stem: string;
  options: string[];
  answer_index: number;
  justification: string;
  source_book: string;
  source_page: number;
  category: BlueprintCategory;
  difficulty: Difficulty;
}

export interface QuestionIssue {
  code: string;
  message: string;
}

export interface QuestionResult {
  index: number; // 0-based index within its file
  file: string;
  question: AuthoredQuestion;
  issues: QuestionIssue[];
}

export interface FileResult {
  file: string;
  results: QuestionResult[];
}

export interface VerifyReport {
  files: FileResult[];
  totalQuestions: number;
  totalFailures: number;
}

const MIN_SHARED_TOKENS = 5;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "of", "to", "in", "on", "for",
  "with", "as", "by", "at", "from", "is", "are", "was", "were", "be", "been", "being", "this",
  "that", "these", "those", "it", "its", "into", "than", "which", "who", "whom", "their", "there",
  "not", "no", "can", "will", "would", "should", "may", "might", "must", "also", "such", "each",
  "any", "all", "more", "most", "other", "some", "when", "where", "how", "what", "why", "does",
  "do", "did", "has", "have", "had", "you", "your", "we", "our", "they", "them", "he", "she",
  "his", "her", "i", "my", "me", "so", "because", "about", "over", "under", "between", "during",
]);

/** Lowercases and extracts word-like tokens, excluding stopwords and tokens shorter than 3 chars. */
export function tokenize(text: string): string[] {
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Number of distinct meaningful tokens shared between two texts. */
export function sharedTokenCount(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  let count = 0;
  for (const t of setA) {
    if (setB.has(t)) count++;
  }
  return count;
}

/** Reads and parses pipeline/output/chunks.jsonl (or a given path) into memory. */
export function loadChunks(chunksPath: string = CHUNKS_PATH): Chunk[] {
  if (!fs.existsSync(chunksPath)) return [];
  const raw = fs.readFileSync(chunksPath, "utf-8");
  const chunks: Chunk[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      chunks.push(JSON.parse(trimmed) as Chunk);
    } catch {
      // skip malformed lines; not this tool's concern to validate the pipeline output
    }
  }
  return chunks;
}

/** Finds a chunk matching the given book (case-insensitive) whose page range contains `page`. */
export function findMatchingChunk(
  chunks: Chunk[],
  book: string,
  page: number
): Chunk | undefined {
  const normalizedBook = book.trim().toLowerCase();
  return chunks.find(
    (c) =>
      c.book.trim().toLowerCase() === normalizedBook &&
      page >= c.page_start &&
      page <= c.page_end
  );
}

/**
 * Validates a single authored question. Returns a list of issues (empty = pass).
 * Checks structural validity, source-chunk existence, and justification grounding.
 */
export function validateQuestion(q: AuthoredQuestion, chunks: Chunk[]): QuestionIssue[] {
  const issues: QuestionIssue[] = [];

  // --- structural checks ---
  if (typeof q.stem !== "string" || q.stem.trim().length === 0) {
    issues.push({ code: "empty_stem", message: "stem is missing or empty" });
  }

  if (!Array.isArray(q.options) || q.options.length !== 4) {
    issues.push({ code: "bad_options", message: "options must be an array of exactly 4 strings" });
  } else if (q.options.some((o) => typeof o !== "string" || o.trim().length === 0)) {
    issues.push({ code: "empty_option", message: "one or more options is empty" });
  }

  if (
    typeof q.answer_index !== "number" ||
    !Number.isInteger(q.answer_index) ||
    q.answer_index < 0 ||
    q.answer_index > 3
  ) {
    issues.push({ code: "bad_answer_index", message: "answer_index must be an integer 0-3" });
  }

  if (typeof q.justification !== "string" || q.justification.trim().length === 0) {
    issues.push({ code: "empty_justification", message: "justification is missing or empty" });
  }

  if (!CATEGORIES.includes(q.category)) {
    issues.push({ code: "bad_category", message: `category "${q.category}" is not one of the 14 blueprint categories` });
  }

  if (!DIFFICULTIES.includes(q.difficulty)) {
    issues.push({ code: "bad_difficulty", message: `difficulty "${q.difficulty}" must be one of ${DIFFICULTIES.join(", ")}` });
  }

  if (typeof q.source_book !== "string" || q.source_book.trim().length === 0) {
    issues.push({ code: "empty_source_book", message: "source_book is missing or empty" });
  }

  if (typeof q.source_page !== "number" || !Number.isInteger(q.source_page) || q.source_page < 1) {
    issues.push({ code: "bad_source_page", message: "source_page must be a positive integer" });
  }

  // --- source-grounding checks (only meaningful if the fields above are sane) ---
  const hasSourceFields =
    typeof q.source_book === "string" &&
    q.source_book.trim().length > 0 &&
    typeof q.source_page === "number" &&
    Number.isInteger(q.source_page);

  if (hasSourceFields) {
    const chunk = findMatchingChunk(chunks, q.source_book, q.source_page);
    if (!chunk) {
      issues.push({
        code: "source_not_found",
        message: `no chunk found for book "${q.source_book}" page ${q.source_page}`,
      });
    } else if (typeof q.justification === "string" && q.justification.trim().length > 0) {
      const shared = sharedTokenCount(q.justification, chunk.text);
      if (shared < MIN_SHARED_TOKENS) {
        issues.push({
          code: "ungrounded_justification",
          message: `justification shares only ${shared} meaningful token(s) with source chunk (need >= ${MIN_SHARED_TOKENS})`,
        });
      }
    }
  }

  return issues;
}

/** Loads all pipeline/questions/*.json files. Returns an empty array if the dir doesn't exist. */
export function loadQuestionFiles(dir: string = QUESTIONS_DIR): { file: string; questions: AuthoredQuestion[] }[] {
  if (!fs.existsSync(dir)) return [];

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  return files.map((file) => {
    const fullPath = path.join(dir, file);
    const raw = fs.readFileSync(fullPath, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Failed to parse ${file}: ${(err as Error).message}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`${file} must contain a JSON array of question objects`);
    }
    return { file, questions: parsed as AuthoredQuestion[] };
  });
}

/** Runs validateQuestion over every question in every file and builds a full report. */
export function verifyAll(
  fileEntries: { file: string; questions: AuthoredQuestion[] }[],
  chunks: Chunk[]
): VerifyReport {
  const files: FileResult[] = fileEntries.map(({ file, questions }) => ({
    file,
    results: questions.map((question, index) => ({
      index,
      file,
      question,
      issues: validateQuestion(question, chunks),
    })),
  }));

  const totalQuestions = files.reduce((sum, f) => sum + f.results.length, 0);
  const totalFailures = files.reduce(
    (sum, f) => sum + f.results.filter((r) => r.issues.length > 0).length,
    0
  );

  return { files, totalQuestions, totalFailures };
}
