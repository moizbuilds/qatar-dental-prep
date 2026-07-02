import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createAttempt,
  recordAnswer,
  _setDbForTests,
  _resetDbForTests,
} from "../../../lib/db";
import { GET } from "./route";
import { BLUEPRINT } from "../../../lib/db/types";

let tmpDir: string;
let db: Database.Database;

function applySchema(database: Database.Database) {
  const schemaPath = path.join(process.cwd(), "lib", "db", "schema.sql");
  database.exec(fs.readFileSync(schemaPath, "utf-8"));
}

function seedQuestion(category: string): number {
  const res = db
    .prepare(
      `INSERT INTO questions (category, stem, choices, correct_index, explanation, source_chunk_id) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(category, "Q?", JSON.stringify(["A", "B", "C", "D"]), 0, "e", null);
  return Number(res.lastInsertRowid);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "statstest-"));
  db = new Database(path.join(tmpDir, "test.db"));
  applySchema(db);
  _setDbForTests(db);
});

afterEach(() => {
  _resetDbForTests();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("GET /api/stats", () => {
  it("returns every blueprint category, zero-filled when nothing attempted", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.categories.length).toBe(BLUEPRINT.length);
    expect(body.history).toEqual([]);
    expect(body.weakest).toEqual([]);
    expect(body.passThreshold).toBe(60);
    expect(body.categories.every((c: { accuracyPercent: number }) => c.accuracyPercent === 0)).toBe(true);
  });

  it("aggregates accuracy and surfaces weakest categories", async () => {
    const perioQ = seedQuestion("periodontics");
    const pedoQ = seedQuestion("pediatric");
    const attempt = createAttempt();
    // periodontics 100% (1/1), pediatric 0% (0/1)
    recordAnswer({ attempt_id: attempt, question_id: perioQ, selected_index: 0, is_correct: true });
    recordAnswer({ attempt_id: attempt, question_id: pedoQ, selected_index: 1, is_correct: false });

    const res = await GET();
    const body = await res.json();

    const perio = body.categories.find((c: { category: string }) => c.category === "periodontics");
    const pedo = body.categories.find((c: { category: string }) => c.category === "pediatric");
    expect(perio.accuracyPercent).toBe(100);
    expect(pedo.accuracyPercent).toBe(0);
    expect(body.weakest[0]).toBe("pediatric");
    expect(body.history.length).toBe(1);
    expect(body.history[0].pct).toBe(50); // 1 of 2 correct across the attempt
  });
});
