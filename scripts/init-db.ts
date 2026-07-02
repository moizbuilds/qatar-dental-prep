// Applies lib/db/schema.sql to data/app.db, creating the DB file/dir if needed.
// Usage: npm run db:init

import { getDb } from "../lib/db/sqlite";

function main() {
  const db = getDb();
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all() as { name: string }[];

  console.log(`Schema applied to data/app.db. Tables: ${tables.map((t) => t.name).join(", ")}`);
  db.close();
}

main();
