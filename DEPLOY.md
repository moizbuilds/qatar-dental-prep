# Deploying to the web (Supabase + Vercel)

The app is **local-first**: it runs on your Mac with a SQLite database and no
cloud accounts. This was a deliberate choice so it works immediately and costs
nothing to run the quiz. When you want it on your phone anywhere (not just on
your laptop), move the data layer to Supabase and host on Vercel.

Because all database access goes through `lib/db/*`, the app code above that
boundary (routes, pages, components) does not change. You reimplement the same
exported functions against Supabase.

## What changes

| Concern | Local (now) | Web (later) |
|---|---|---|
| Storage | SQLite file `data/app.db` | Supabase Postgres |
| Full-text search | SQLite FTS5 (`searchChunks`) | Postgres full-text (`tsvector`) + optionally `pgvector` |
| Embeddings | none (FTS only) | optional: Supabase Edge Function `gte-small` (free, 384-dim) for semantic retrieval |
| Hosting | `npm run dev` | Vercel |
| Secrets | `.env.local` | Vercel project environment variables |

## Steps

1. **Create a Supabase project.** Enable the `pg_trgm` extension (and
   `vector` if you want semantic search).

2. **Port the schema.** Translate `lib/db/schema.sql` to Postgres: `chunks`,
   `questions`, `quiz_attempts`, `answers`, `chat_messages`. Replace the FTS5
   virtual table with a `tsvector` column + GIN index (and/or a `vector(384)`
   column for embeddings).

3. **Reimplement `lib/db`** against `@supabase/supabase-js` (or `postgres`),
   keeping the exact exported signatures — `searchChunks`, `insertQuestion`,
   `randomMock`, `createAttempt`, `recordAnswer`, `attemptStats`,
   `attemptHistory`, `missedQuestions`, `getChunkById`, `saveChatMessage`,
   `listChatMessages`. Nothing above `lib/db` needs to change.

4. **Load content.** Adapt `scripts/load-chunks.ts` and
   `scripts/load-questions.ts` to insert into Supabase. If using embeddings,
   generate them for each chunk via the Supabase Edge Function and store them
   in the `vector` column; make `searchChunks` a hybrid of full-text +
   vector similarity.

5. **Deploy to Vercel.** Import the repo, and set the environment variables
   in the Vercel dashboard (never commit them):
   - `ANTHROPIC_API_KEY`
   - `APP_PASSCODE`
   - `SESSION_SECRET`
   - Supabase URL + service key
   - `TRUST_PROXY=1` — Vercel sits behind a proxy that sets a trustworthy
     `X-Forwarded-For`, so the login rate limiter can key on it.

6. **Middleware runtime.** `middleware.ts` uses `runtime: "nodejs"` (it needs
   `node:crypto`). This is supported on Vercel; keep it.

## Cost

Quiz mode stays free. Ask mode is the only paid piece — roughly
$0.01–0.02 per question on `claude-sonnet-5`, so about $10–15/month with
heavy daily study. Supabase and Vercel both have free tiers sufficient for a
single user.
