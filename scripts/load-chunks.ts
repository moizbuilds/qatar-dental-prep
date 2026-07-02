// Bulk-loads pipeline/output/chunks.jsonl into the chunks table (+ FTS index).
// Usage: npm run db:load

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { getDb, insertChunks } from "../lib/db/sqlite";
import type { Chunk } from "../lib/db/types";

const CHUNKS_PATH = path.join(process.cwd(), "pipeline", "output", "chunks.jsonl");
const BATCH_SIZE = 500;

async function main() {
  if (!fs.existsSync(CHUNKS_PATH)) {
    console.error(`chunks.jsonl not found at ${CHUNKS_PATH}. Run the extraction pipeline first.`);
    process.exit(1);
  }

  const db = getDb();

  const rl = readline.createInterface({
    input: fs.createReadStream(CHUNKS_PATH, "utf-8"),
    crlfDelay: Infinity,
  });

  let batch: Chunk[] = [];
  let total = 0;
  let lineNum = 0;

  for await (const line of rl) {
    lineNum++;
    const trimmed = line.trim();
    if (!trimmed) continue;

    let record: Chunk;
    try {
      record = JSON.parse(trimmed) as Chunk;
    } catch (err) {
      console.warn(`Skipping malformed JSON on line ${lineNum}: ${(err as Error).message}`);
      continue;
    }

    batch.push(record);
    if (batch.length >= BATCH_SIZE) {
      total += insertChunks(batch);
      batch = [];
    }
  }

  if (batch.length > 0) {
    total += insertChunks(batch);
  }

  console.log(`Loaded ${total} chunks from ${CHUNKS_PATH} into data/app.db.`);
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
