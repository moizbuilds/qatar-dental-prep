// Loads pipeline/questions/*.json into the questions table.
//
// Runs verification first (see scripts/verify-questions.ts); if any question
// fails verification, the load is aborted and nothing is written.
//
// Idempotent: each run clears the existing questions table (and dependent
// answers, since answers.question_id references questions.id) before
// re-inserting the freshly-verified set, so re-running never duplicates
// rows. This is simpler and safer than upserting by a derived "stable key"
// (stem hash, etc.) since authored questions may be edited in place between
// runs and we always want the DB to mirror the JSON files exactly.
//
// Usage: npm run questions:load

import { getDb, insertQuestion } from "../lib/db/sqlite";
import type { NewQuestion } from "../lib/db/types";
import {
  loadChunks,
  loadQuestionFiles,
  verifyAll,
  findMatchingChunk,
  QUESTIONS_DIR,
  type AuthoredQuestion,
} from "./lib/questions-shared";

/**
 * Maps an authored question (pipeline/questions/<category>.json shape) onto
 * the NewQuestion shape expected by insertQuestion. `difficulty` has no
 * corresponding column in the questions table and is intentionally dropped.
 */
function toNewQuestion(q: AuthoredQuestion, sourceChunkId: string | null): NewQuestion {
  return {
    category: q.category,
    stem: q.stem,
    choices: q.options,
    correct_index: q.answer_index,
    explanation: q.justification,
    source_chunk_id: sourceChunkId,
  };
}

function main() {
  const chunks = loadChunks();

  let fileEntries: ReturnType<typeof loadQuestionFiles>;
  try {
    fileEntries = loadQuestionFiles();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  if (fileEntries.length === 0) {
    console.log(`No question files found in ${QUESTIONS_DIR}. Nothing to load.`);
    return;
  }

  const report = verifyAll(fileEntries, chunks);
  if (report.totalFailures > 0) {
    console.error(
      `Verification failed: ${report.totalFailures}/${report.totalQuestions} question(s) failed. Run "npm run questions:verify" for details. Aborting load.`
    );
    process.exit(1);
  }

  const db = getDb();

  // Reloading the bank clears questions and, by FK dependency, every recorded
  // answer. That destroys the user's quiz history, so refuse to do it silently
  // once answers exist — require an explicit --force.
  const force = process.argv.includes("--force");
  const answerCount = (
    db.prepare(`SELECT COUNT(*) AS n FROM answers`).get() as { n: number }
  ).n;
  if (answerCount > 0 && !force) {
    console.error(
      `Refusing to reload: ${answerCount} recorded answer(s) exist and reloading clears them ` +
        `(answers.question_id references questions.id). Re-run with --force to wipe quiz history and reload.`
    );
    process.exit(1);
  }

  const loadAll = db.transaction(() => {
    // Clear dependent rows first (FK: answers.question_id -> questions.id).
    db.prepare(`DELETE FROM answers`).run();
    db.prepare(`DELETE FROM questions`).run();

    let inserted = 0;
    for (const { questions } of fileEntries) {
      for (const q of questions) {
        const chunk = findMatchingChunk(chunks, q.source_book, q.source_page);
        insertQuestion(toNewQuestion(q, chunk?.id ?? null));
        inserted++;
      }
    }
    return inserted;
  });

  const inserted = loadAll();
  console.log(`Loaded ${inserted} questions from ${fileEntries.length} file(s) into data/app.db.`);
  db.close();
}

main();
