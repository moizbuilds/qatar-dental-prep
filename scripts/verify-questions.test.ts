import { describe, it, expect } from "vitest";
import type { Chunk } from "../lib/db/types";
import {
  type AuthoredQuestion,
  validateQuestion,
  verifyAll,
  tokenize,
  sharedTokenCount,
  findMatchingChunk,
} from "./lib/questions-shared";

const FIXTURE_CHUNKS: Chunk[] = [
  {
    id: "c1",
    book: "Clinical Periodontology",
    page_start: 40,
    page_end: 42,
    category_hint: "periodontics",
    text: "Periodontal probing depth is measured from the gingival margin to the base of the pocket using a calibrated periodontal probe. Increased probing depths indicate attachment loss and are a key diagnostic sign of periodontitis. Bleeding on probing is also recorded as an indicator of active inflammation.",
  },
  {
    id: "c2",
    book: "Pediatric Dentistry Handbook",
    page_start: 100,
    page_end: 101,
    category_hint: "pediatric",
    text: "Pulpotomy is indicated for primary teeth with deep carious lesions where the coronal pulp is inflamed but the radicular pulp remains healthy. The procedure removes the coronal pulp tissue and places a medicament over the remaining radicular pulp stumps.",
  },
];

const GOOD_QUESTION: AuthoredQuestion = {
  stem: "What instrument is used to measure periodontal probing depth?",
  options: ["Explorer", "Periodontal probe", "Curette", "Scaler"],
  answer_index: 1,
  justification:
    "Periodontal probing depth is measured using a calibrated periodontal probe from the gingival margin to the base of the pocket, and increased depths indicate attachment loss.",
  source_book: "Clinical Periodontology",
  source_page: 41,
  category: "periodontics",
  difficulty: "easy",
};

const BAD_QUESTION_WRONG_PAGE: AuthoredQuestion = {
  ...GOOD_QUESTION,
  stem: "What instrument is used to measure periodontal probing depth? (bad copy)",
  source_page: 999, // no chunk covers this page for this book
};

const BAD_QUESTION_UNGROUNDED: AuthoredQuestion = {
  stem: "What is the primary indication for pulpotomy in primary teeth?",
  options: ["Deep caries with inflamed coronal pulp", "Orthodontic crowding", "Enamel fluorosis", "Gingival recession"],
  answer_index: 0,
  // Justification talks about something unrelated to the cited chunk's content.
  justification:
    "Orthodontic treatment planning requires cephalometric analysis and study models before appliance selection.",
  source_book: "Pediatric Dentistry Handbook",
  source_page: 100,
  category: "pediatric",
  difficulty: "medium",
};

describe("tokenize", () => {
  it("lowercases, strips punctuation, and drops short/stopword tokens", () => {
    const tokens = tokenize("The Periodontal Probe measures pocket depth, and it is useful.");
    expect(tokens).toContain("periodontal");
    expect(tokens).toContain("probe");
    expect(tokens).toContain("measures");
    expect(tokens).toContain("pocket");
    expect(tokens).toContain("depth");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("and");
    expect(tokens).not.toContain("is");
  });
});

describe("sharedTokenCount", () => {
  it("counts distinct meaningful tokens shared between two texts", () => {
    const count = sharedTokenCount(
      "Periodontal probing depth measured with a probe",
      "Periodontal probing depth is measured from the gingival margin using a probe"
    );
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it("returns 0 for completely unrelated texts", () => {
    const count = sharedTokenCount(
      "Orthodontic cephalometric analysis appliance",
      "Periodontal probing depth gingival margin pocket"
    );
    expect(count).toBe(0);
  });
});

describe("findMatchingChunk", () => {
  it("finds a chunk by case-insensitive book title and page within range", () => {
    const chunk = findMatchingChunk(FIXTURE_CHUNKS, "clinical periodontology", 41);
    expect(chunk?.id).toBe("c1");
  });

  it("returns undefined when no chunk covers the page", () => {
    const chunk = findMatchingChunk(FIXTURE_CHUNKS, "Clinical Periodontology", 999);
    expect(chunk).toBeUndefined();
  });

  it("returns undefined when the book title doesn't match", () => {
    const chunk = findMatchingChunk(FIXTURE_CHUNKS, "Some Other Book", 41);
    expect(chunk).toBeUndefined();
  });
});

describe("validateQuestion", () => {
  it("passes a well-formed, grounded question", () => {
    const issues = validateQuestion(GOOD_QUESTION, FIXTURE_CHUNKS);
    expect(issues).toEqual([]);
  });

  it("fails a question whose source_page has no matching chunk", () => {
    const issues = validateQuestion(BAD_QUESTION_WRONG_PAGE, FIXTURE_CHUNKS);
    expect(issues.some((i) => i.code === "source_not_found")).toBe(true);
  });

  it("fails a question whose justification is not grounded in the cited chunk", () => {
    const issues = validateQuestion(BAD_QUESTION_UNGROUNDED, FIXTURE_CHUNKS);
    expect(issues.some((i) => i.code === "ungrounded_justification")).toBe(true);
  });

  it("fails a question with fewer than 4 options", () => {
    const bad: AuthoredQuestion = { ...GOOD_QUESTION, options: ["A", "B", "C"] };
    const issues = validateQuestion(bad, FIXTURE_CHUNKS);
    expect(issues.some((i) => i.code === "bad_options")).toBe(true);
  });

  it("fails a question with an out-of-range answer_index", () => {
    const bad: AuthoredQuestion = { ...GOOD_QUESTION, answer_index: 4 };
    const issues = validateQuestion(bad, FIXTURE_CHUNKS);
    expect(issues.some((i) => i.code === "bad_answer_index")).toBe(true);
  });

  it("fails a question with an invalid category", () => {
    // @ts-expect-error intentionally invalid for the test
    const bad: AuthoredQuestion = { ...GOOD_QUESTION, category: "not_a_real_category" };
    const issues = validateQuestion(bad, FIXTURE_CHUNKS);
    expect(issues.some((i) => i.code === "bad_category")).toBe(true);
  });

  it("fails a question with an invalid difficulty", () => {
    // @ts-expect-error intentionally invalid for the test
    const bad: AuthoredQuestion = { ...GOOD_QUESTION, difficulty: "impossible" };
    const issues = validateQuestion(bad, FIXTURE_CHUNKS);
    expect(issues.some((i) => i.code === "bad_difficulty")).toBe(true);
  });

  it("fails a question with an empty stem", () => {
    const bad: AuthoredQuestion = { ...GOOD_QUESTION, stem: "   " };
    const issues = validateQuestion(bad, FIXTURE_CHUNKS);
    expect(issues.some((i) => i.code === "empty_stem")).toBe(true);
  });
});

describe("verifyAll", () => {
  it("builds a report with per-file, per-question results and correct totals", () => {
    const report = verifyAll(
      [
        { file: "periodontics.json", questions: [GOOD_QUESTION, BAD_QUESTION_WRONG_PAGE] },
        { file: "pediatric.json", questions: [BAD_QUESTION_UNGROUNDED] },
      ],
      FIXTURE_CHUNKS
    );

    expect(report.totalQuestions).toBe(3);
    expect(report.totalFailures).toBe(2);
    expect(report.files).toHaveLength(2);
    expect(report.files[0].results[0].issues).toEqual([]);
    expect(report.files[0].results[1].issues.length).toBeGreaterThan(0);
    expect(report.files[1].results[0].issues.length).toBeGreaterThan(0);
  });

  it("returns an empty report (0 questions, 0 failures) when given no files", () => {
    const report = verifyAll([], FIXTURE_CHUNKS);
    expect(report.totalQuestions).toBe(0);
    expect(report.totalFailures).toBe(0);
    expect(report.files).toEqual([]);
  });
});
