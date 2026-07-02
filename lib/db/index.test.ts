import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getDb,
  searchChunks,
  insertQuestion,
  listQuestions,
  getQuestionsByCategory,
  randomMock,
  createAttempt,
  recordAnswer,
  attemptHistory,
  attemptExists,
  completeAttempt,
  attemptStats,
  missedQuestions,
  saveChatMessage,
  listChatMessages,
  _setDbForTests,
  _resetDbForTests,
} from "./sqlite";
import { BLUEPRINT, type BlueprintCategory, type NewQuestion } from "./types";

let tmpDir: string;
let dbPath: string;
let db: Database.Database;

function applySchema(database: Database.Database) {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  database.exec(schema);
}

function insertFixtureChunks(database: Database.Database) {
  const insert = database.prepare(
    `INSERT INTO chunks (id, book, page_start, page_end, category_hint, text) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const fixtures = [
    ["c1", "Book A", 1, 1, "restorative_endodontics", "Root canal therapy involves cleaning and shaping the canal system."],
    ["c2", "Book A", 2, 2, "restorative_endodontics", "Endodontic obturation seals the canal after instrumentation."],
    ["c3", "Book B", 5, 5, "periodontics", "Periodontal probing depths are measured in millimeters around each tooth."],
    ["c4", "Book B", 6, 6, "periodontics", "Scaling and root planing removes subgingival calculus."],
    ["c5", "Book C", 10, 10, "pediatric", "Pulpotomy is a common treatment for primary teeth with deep caries."],
  ];
  for (const f of fixtures) insert.run(...f);
}

function makeQuestion(category: BlueprintCategory, i: number): NewQuestion {
  return {
    category,
    stem: `Sample question ${i} for ${category}?`,
    choices: ["A", "B", "C", "D"],
    correct_index: 0,
    explanation: `Explanation ${i}`,
    source_chunk_id: null,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dbtest-"));
  dbPath = path.join(tmpDir, "test.db");
  db = new Database(dbPath);
  applySchema(db);
  insertFixtureChunks(db);
  _setDbForTests(db);
});

afterEach(() => {
  _resetDbForTests();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("getDb", () => {
  it("returns a usable better-sqlite3 Database instance", () => {
    const instance = getDb();
    const row = instance.prepare("SELECT 1 AS one").get() as { one: number };
    expect(row.one).toBe(1);
  });
});

describe("searchChunks", () => {
  it("returns ranked matches for a simple query", () => {
    const results = searchChunks("canal", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.text.toLowerCase().includes("canal"))).toBe(true);
  });

  it("respects the limit parameter", () => {
    const results = searchChunks("the", 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("ranks more relevant matches first", () => {
    const results = searchChunks("endodontic obturation canal", 10);
    expect(results.length).toBeGreaterThan(0);
    // c2 mentions "endodontic obturation" and "canal" - should be a top hit
    expect(results[0].id).toBe("c2");
  });

  it("does not throw on punctuation / FTS5 special characters", () => {
    expect(() => searchChunks("root canal?", 10)).not.toThrow();
    expect(() => searchChunks('"unterminated quote', 10)).not.toThrow();
    expect(() => searchChunks("NOT AND OR -foo", 10)).not.toThrow();
    expect(() => searchChunks("(((", 10)).not.toThrow();
    expect(() => searchChunks("", 10)).not.toThrow();
    expect(() => searchChunks("   ", 10)).not.toThrow();
  });

  it("returns empty array for an empty/whitespace-only query", () => {
    expect(searchChunks("", 10)).toEqual([]);
    expect(searchChunks("   ", 10)).toEqual([]);
  });

  it("still finds results when query contains punctuation", () => {
    const results = searchChunks("root canal?", 10);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("insertQuestion / listQuestions / getQuestionsByCategory", () => {
  it("inserts a question and returns a numeric id", () => {
    const id = insertQuestion(makeQuestion("periodontics", 1));
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("lists questions with no filter", () => {
    insertQuestion(makeQuestion("periodontics", 1));
    insertQuestion(makeQuestion("pediatric", 2));
    const all = listQuestions({});
    expect(all.length).toBe(2);
  });

  it("filters listQuestions by category", () => {
    insertQuestion(makeQuestion("periodontics", 1));
    insertQuestion(makeQuestion("pediatric", 2));
    const periodontics = listQuestions({ category: "periodontics" });
    expect(periodontics.length).toBe(1);
    expect(periodontics[0].category).toBe("periodontics");
  });

  it("parses choices back into an array", () => {
    insertQuestion(makeQuestion("periodontics", 1));
    const [q] = listQuestions({ category: "periodontics" });
    expect(Array.isArray(q.choices)).toBe(true);
    expect(q.choices).toEqual(["A", "B", "C", "D"]);
  });

  it("getQuestionsByCategory returns at most n questions from that category", () => {
    for (let i = 0; i < 5; i++) insertQuestion(makeQuestion("periodontics", i));
    const result = getQuestionsByCategory("periodontics", 3);
    expect(result.length).toBe(3);
    expect(result.every((q) => q.category === "periodontics")).toBe(true);
  });
});

describe("randomMock", () => {
  it("returns exactly 150 questions distributed per the blueprint when enough exist", () => {
    for (const { category, examCount } of BLUEPRINT) {
      // seed a few extra so selection has something to randomize over
      for (let i = 0; i < examCount + 3; i++) {
        insertQuestion(makeQuestion(category, i));
      }
    }

    const mock = randomMock();
    expect(mock.length).toBe(150);

    const counts: Record<string, number> = {};
    for (const q of mock) counts[q.category] = (counts[q.category] ?? 0) + 1;

    for (const { category, examCount } of BLUEPRINT) {
      expect(counts[category]).toBe(examCount);
    }
  });

  it("degrades gracefully and logs a shortfall when a category is short", () => {
    for (const { category, examCount } of BLUEPRINT) {
      const seedCount = category === "orthodontics" ? 2 : examCount + 3;
      for (let i = 0; i < seedCount; i++) {
        insertQuestion(makeQuestion(category, i));
      }
    }

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mock = randomMock();

    // orthodontics only had 2 available instead of 5 -> total is 3 short of 150
    expect(mock.length).toBe(147);
    const orthoCount = mock.filter((q) => q.category === "orthodontics").length;
    expect(orthoCount).toBe(2);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe("createAttempt / recordAnswer / attemptStats / missedQuestions", () => {
  it("creates an attempt and returns a numeric id", () => {
    const id = createAttempt();
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("aggregates per-category accuracy across recorded answers", () => {
    const perioQ1 = insertQuestion(makeQuestion("periodontics", 1));
    const perioQ2 = insertQuestion(makeQuestion("periodontics", 2));
    const pedoQ1 = insertQuestion(makeQuestion("pediatric", 1));

    const attemptId = createAttempt();
    recordAnswer({ attempt_id: attemptId, question_id: perioQ1, selected_index: 0, is_correct: true });
    recordAnswer({ attempt_id: attemptId, question_id: perioQ2, selected_index: 1, is_correct: false });
    recordAnswer({ attempt_id: attemptId, question_id: pedoQ1, selected_index: 0, is_correct: true });

    const stats = attemptStats();
    const perio = stats.find((s) => s.category === "periodontics");
    const pedo = stats.find((s) => s.category === "pediatric");

    expect(perio).toBeDefined();
    expect(perio!.attempted).toBe(2);
    expect(perio!.correct).toBe(1);
    expect(perio!.accuracy).toBeCloseTo(0.5);

    expect(pedo).toBeDefined();
    expect(pedo!.attempted).toBe(1);
    expect(pedo!.correct).toBe(1);
    expect(pedo!.accuracy).toBeCloseTo(1);
  });

  it("missedQuestions returns questions answered incorrectly at least once", () => {
    const q1 = insertQuestion(makeQuestion("periodontics", 1));
    const q2 = insertQuestion(makeQuestion("pediatric", 1));

    const attemptId = createAttempt();
    recordAnswer({ attempt_id: attemptId, question_id: q1, selected_index: 1, is_correct: false });
    recordAnswer({ attempt_id: attemptId, question_id: q2, selected_index: 0, is_correct: true });

    const missed = missedQuestions();
    expect(missed.length).toBe(1);
    expect(missed[0].id).toBe(q1);
  });
});

describe("attemptExists / completeAttempt", () => {
  it("attemptExists is true for a created attempt, false otherwise", () => {
    const id = createAttempt();
    expect(attemptExists(id)).toBe(true);
    expect(attemptExists(id + 999)).toBe(false);
  });

  it("completeAttempt stamps completed_at", () => {
    const id = createAttempt();
    expect(db.prepare(`SELECT completed_at FROM quiz_attempts WHERE id = ?`).get(id)).toEqual({
      completed_at: null,
    });
    completeAttempt(id);
    const row = db.prepare(`SELECT completed_at FROM quiz_attempts WHERE id = ?`).get(id) as {
      completed_at: string | null;
    };
    expect(row.completed_at).not.toBeNull();
  });
});

describe("attemptHistory", () => {
  it("returns per-attempt scores as rounded percentages, oldest first", () => {
    const insertQ = db.prepare(
      `INSERT INTO questions (category, stem, choices, correct_index, explanation, source_chunk_id) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const q1 = Number(insertQ.run("periodontics", "Q1?", JSON.stringify(["A", "B", "C", "D"]), 0, "e", null).lastInsertRowid);
    const q2 = Number(insertQ.run("periodontics", "Q2?", JSON.stringify(["A", "B", "C", "D"]), 0, "e", null).lastInsertRowid);

    const a1 = createAttempt();
    recordAnswer({ attempt_id: a1, question_id: q1, selected_index: 0, is_correct: true });
    recordAnswer({ attempt_id: a1, question_id: q2, selected_index: 1, is_correct: false });

    const a2 = createAttempt();
    recordAnswer({ attempt_id: a2, question_id: q1, selected_index: 0, is_correct: true });
    recordAnswer({ attempt_id: a2, question_id: q2, selected_index: 0, is_correct: true });

    const history = attemptHistory();
    expect(history.length).toBe(2);
    expect(history[0].attempt_id).toBe(a1);
    expect(history[0].pct).toBe(50); // 1/2
    expect(history[1].attempt_id).toBe(a2);
    expect(history[1].pct).toBe(100); // 2/2
  });

  it("ignores attempts with no recorded answers", () => {
    createAttempt(); // no answers recorded
    expect(attemptHistory().length).toBe(0);
  });
});

describe("saveChatMessage / listChatMessages", () => {
  it("saves and lists messages scoped to a session, in order", () => {
    saveChatMessage({ session: "s1", role: "user", content: "What is a pulpotomy?" });
    saveChatMessage({ session: "s1", role: "assistant", content: "A pulpotomy is..." });
    saveChatMessage({ session: "s2", role: "user", content: "Unrelated session" });

    const s1Messages = listChatMessages("s1");
    expect(s1Messages.length).toBe(2);
    expect(s1Messages[0].role).toBe("user");
    expect(s1Messages[1].role).toBe("assistant");

    const s2Messages = listChatMessages("s2");
    expect(s2Messages.length).toBe(1);
  });
});
