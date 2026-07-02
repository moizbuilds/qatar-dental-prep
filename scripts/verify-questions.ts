// Verifies pipeline/questions/*.json against pipeline/output/chunks.jsonl.
//
// Checks, per question:
//   (a) structural validity (4 options, valid answer_index, non-empty stem/
//       justification, category is one of the 14 blueprint categories,
//       difficulty is easy|medium|hard)
//   (b) the cited source_book + source_page corresponds to a real chunk in
//       chunks.jsonl (matched by book title, case-insensitive, and page
//       falling within [page_start, page_end])
//   (c) the justification is grounded in the cited chunk's text (shares at
//       least 5 meaningful, lowercased, non-stopword tokens with it)
//
// Usage:
//   npm run questions:verify            # report all failures (default)
//   npm run questions:verify -- --strict  # same checks, but also fails the
//                                          # process (exit 1) even when there
//                                          # are 0 questions to verify
//
// If pipeline/questions/ is absent or empty, this reports "0 questions" and
// exits 0 (nothing to verify is not a failure) unless --strict is passed.

import { loadChunks, loadQuestionFiles, verifyAll, QUESTIONS_DIR } from "./lib/questions-shared";

function main() {
  const strict = process.argv.includes("--strict");

  const chunks = loadChunks();
  if (chunks.length === 0) {
    console.warn(`Warning: no chunks loaded from chunks.jsonl. Source-grounding checks will fail for all questions.`);
  }

  let fileEntries: ReturnType<typeof loadQuestionFiles>;
  try {
    fileEntries = loadQuestionFiles();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const report = verifyAll(fileEntries, chunks);

  if (report.totalQuestions === 0) {
    console.log(`No question files found in ${QUESTIONS_DIR}. Nothing to verify.`);
    process.exit(strict ? 1 : 0);
  }

  for (const file of report.files) {
    const failures = file.results.filter((r) => r.issues.length > 0);
    const passed = file.results.length - failures.length;
    console.log(`\n${file.file}: ${passed}/${file.results.length} passed`);

    for (const result of failures) {
      const label = result.question?.stem
        ? `"${result.question.stem.slice(0, 60)}${result.question.stem.length > 60 ? "..." : ""}"`
        : "(no stem)";
      console.log(`  [FAIL] #${result.index} ${label}`);
      for (const issue of result.issues) {
        console.log(`    - ${issue.code}: ${issue.message}`);
      }
    }
  }

  console.log(
    `\nTotal: ${report.totalQuestions} questions, ${report.totalQuestions - report.totalFailures} passed, ${report.totalFailures} failed.`
  );

  if (report.totalFailures > 0) {
    process.exit(1);
  }
}

main();
