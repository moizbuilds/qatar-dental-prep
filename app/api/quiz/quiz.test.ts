import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  insertQuestion,
  insertChunks,
  _setDbForTests,
  _resetDbForTests,
} from "../../../lib/db";
import type { NewQuestion } from "../../../lib/db/types";

import { POST as startQuiz } from "./start/route";
import { POST as answerQuiz } from "./answer/route";
import { POST as finishQuiz } from "./finish/route";

let tmpDir: string;
let db: Database.Database;

function applySchema(database: Database.Database) {
  const schemaPath = path.join(process.cwd(), "lib", "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  database.exec(schema);
}

function makeQuestion(i: number, correctIndex = 0): NewQuestion {
  return {
    category: "periodontics",
    stem: `Sample periodontics question ${i}?`,
    choices: ["Choice A", "Choice B", "Choice C", "Choice D"],
    correct_index: correctIndex,
    explanation: `Explanation for question ${i}`,
    source_chunk_id: "c1",
  };
}

function postJson(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "quiz-api-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  db = new Database(dbPath);
  applySchema(db);
  _setDbForTests(db);

  insertChunks([
    {
      id: "c1",
      book: "Test Book",
      page_start: 42,
      page_end: 43,
      category_hint: "periodontics",
      text: "Periodontal probing depths are measured in millimeters.",
    },
  ]);
});

afterEach(() => {
  _resetDbForTests();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("POST /api/quiz/start", () => {
  it("returns N questions for a topic drill with no correct_index or explanation leaked", async () => {
    for (let i = 0; i < 5; i++) insertQuestion(makeQuestion(i));

    const res = await startQuiz(
      postJson("http://localhost/api/quiz/start", {
        mode: "topic",
        category: "periodontics",
        count: 3,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(typeof body.attemptId).toBe("number");
    expect(body.questions.length).toBe(3);
    for (const q of body.questions) {
      expect(q.category).toBe("periodontics");
      expect(q.stem).toBeTruthy();
      expect(Array.isArray(q.choices)).toBe(true);
      expect(q.choices.length).toBe(4);
      expect(q).not.toHaveProperty("correct_index");
      expect(q).not.toHaveProperty("explanation");
    }
  });
});

describe("full quiz flow: start -> answer -> finish", () => {
  it("returns a passing score when the user answers above the 60% threshold", async () => {
    // 5 questions, correct answer is always index 0
    for (let i = 0; i < 5; i++) insertQuestion(makeQuestion(i, 0));

    const startRes = await startQuiz(
      postJson("http://localhost/api/quiz/start", {
        mode: "topic",
        category: "periodontics",
        count: 5,
      })
    );
    const { attemptId, questions } = await startRes.json();

    // Answer 4/5 correctly (80%) -> passing
    for (let i = 0; i < questions.length; i++) {
      const selectedIndex = i < 4 ? 0 : 1; // last one wrong
      const answerRes = await answerQuiz(
        postJson("http://localhost/api/quiz/answer", {
          attemptId,
          questionId: questions[i].id,
          selectedIndex,
        })
      );
      expect(answerRes.status).toBe(200);
      const answerBody = await answerRes.json();
      expect(answerBody.correct).toBe(selectedIndex === 0);
      expect(answerBody.correctIndex).toBe(0);
      expect(answerBody.explanation).toBeTruthy();
      expect(answerBody.citation).toEqual({ book: "Test Book", page_start: 42 });
    }

    const finishRes = await finishQuiz(
      postJson("http://localhost/api/quiz/finish", { attemptId })
    );
    expect(finishRes.status).toBe(200);
    const finishBody = await finishRes.json();
    expect(finishBody.correct).toBe(4);
    expect(finishBody.total).toBe(5);
    expect(finishBody.percentage).toBe(80);
    expect(finishBody.passed).toBe(true);
  });

  it("returns a failing score when the user answers below the 60% threshold", async () => {
    for (let i = 0; i < 5; i++) insertQuestion(makeQuestion(i, 0));

    const startRes = await startQuiz(
      postJson("http://localhost/api/quiz/start", {
        mode: "topic",
        category: "periodontics",
        count: 5,
      })
    );
    const { attemptId, questions } = await startRes.json();

    // Answer only 2/5 correctly (40%) -> failing
    for (let i = 0; i < questions.length; i++) {
      const selectedIndex = i < 2 ? 0 : 1;
      await answerQuiz(
        postJson("http://localhost/api/quiz/answer", {
          attemptId,
          questionId: questions[i].id,
          selectedIndex,
        })
      );
    }

    const finishRes = await finishQuiz(
      postJson("http://localhost/api/quiz/finish", { attemptId })
    );
    const finishBody = await finishRes.json();
    expect(finishBody.correct).toBe(2);
    expect(finishBody.total).toBe(5);
    expect(finishBody.percentage).toBe(40);
    expect(finishBody.passed).toBe(false);
  });
});
