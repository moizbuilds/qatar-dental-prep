# Qatar Dental Exam Prep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-first, mobile-friendly Next.js study app for the Qatar MOPH National General Dental Qualifying Examination, with a blueprint-weighted verified MCQ quiz bank and a textbook-grounded Ask mode powered by Claude Sonnet 5.

**Architecture:** Next.js (App Router) + TypeScript. Data lives in a local SQLite database (better-sqlite3) with FTS5 full-text search, behind a `lib/db` interface so a later swap to Supabase/pgvector is a config change. A Python pipeline extracts and chunks text from the textbooks in `~/Downloads/Dental Books`. The MCQ bank is authored from that extracted text (each question carries a verified answer, justification, book+page citation, blueprint category, difficulty). Ask mode retrieves top chunks via FTS5 and sends them to the Anthropic API from a server route.

**Tech Stack:** Next.js 15, TypeScript, better-sqlite3, Tailwind CSS, @anthropic-ai/sdk, Python 3 + pypdf, Playwright (smoke tests), Vitest (unit tests).

## Global Constraints

- Single user; access gated by one shared passcode checked server-side (HTTP-only cookie). No public signup.
- Anthropic model for Ask mode: `claude-sonnet-5`. API key read from `ANTHROPIC_API_KEY` env only; never sent to the browser.
- All quiz-mode functionality must work with zero network/API access.
- Exam blueprint weighting (150 items) is authoritative for full-mock sampling — see spec.
- Source content only from `~/Downloads/Dental Books`. Every question cites book + page.
- Data access goes through `lib/db/*`; no raw SQL in React components or routes.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `vitest.config.ts`

- [ ] **Step 1:** Scaffold Next.js app with TypeScript + Tailwind + App Router (non-interactive), add deps: `better-sqlite3`, `@anthropic-ai/sdk`, dev deps `vitest`, `@playwright/test`, `@types/better-sqlite3`.
- [ ] **Step 2:** Add `.env.example` with `ANTHROPIC_API_KEY=`, `APP_PASSCODE=`, `SESSION_SECRET=`. Add `.gitignore` entries for `.env*`, `data/*.db`, `node_modules`, `.next`, `pipeline/output/`.
- [ ] **Step 3:** Minimal home page renders "Qatar Dental Prep" and links to `/quiz` and `/ask`. Run `npm run build`; expected: succeeds.
- [ ] **Step 4:** Commit.

---

### Task 2: PDF extraction + chunking pipeline

**Files:**
- Create: `pipeline/extract.py`, `pipeline/chunk.py`, `pipeline/books.json`, `pipeline/README.md`
- Output (gitignored): `pipeline/output/chunks.jsonl`

**Interfaces:**
- Produces: `chunks.jsonl`, one JSON object per line: `{id, book, page_start, page_end, text}` (~800-token chunks, ~100 overlap).

- [ ] **Step 1:** `books.json` maps each usable PDF filename in `~/Downloads/Dental Books` to a clean title and blueprint category hint. Exclude the 0-byte `Nayak` file and the duplicate blueprint PDF.
- [ ] **Step 2:** `extract.py` reads each PDF with pypdf, emits per-page `{book, page, text}` to an intermediate JSONL; skips empty/failed pages with a logged warning; prints per-book page+char counts.
- [ ] **Step 3:** Run extraction on 3 books of differing layout; eyeball text quality and page numbers. If a book yields near-empty text, flag it in `pipeline/README.md` as needing OCR (out of scope for v1).
- [ ] **Step 4:** `chunk.py` merges per-page text into ~800-token chunks with ~100-token overlap, preserving `page_start`/`page_end`, writes `chunks.jsonl`. Token estimate = whitespace words × 1.3.
- [ ] **Step 5:** Run full pipeline; assert chunk count > 0 for every non-flagged book. Commit code + `books.json` + README (not output).

---

### Task 3: SQLite data layer

**Files:**
- Create: `lib/db/schema.sql`, `lib/db/index.ts`, `lib/db/types.ts`, `scripts/init-db.ts`, `scripts/load-chunks.ts`
- Test: `lib/db/index.test.ts`

**Interfaces:**
- Produces:
  - `getDb(): Database`
  - `searchChunks(query: string, limit: number): Chunk[]` (FTS5 ranked)
  - `insertQuestion(q: NewQuestion): number`, `listQuestions(filter): Question[]`, `getQuestionsByCategory(cat, n): Question[]`, `randomMock(): Question[]` (blueprint-weighted 150)
  - `createAttempt(a): number`, `recordAnswer(a): void`, `attemptStats(): CategoryStat[]`, `missedQuestions(): Question[]`
  - `saveChatMessage(m): void`, `listChatMessages(session): ChatMessage[]`
- Types in `types.ts`: `Chunk`, `Question`, `NewQuestion`, `Attempt`, `Answer`, `CategoryStat`, `ChatMessage`, `BlueprintCategory` (enum of the 14 categories with item counts).

- [ ] **Step 1:** Write `schema.sql`: `chunks` (+ `chunks_fts` FTS5 virtual table), `questions`, `quiz_attempts`, `answers`, `chat_messages`. Write failing test for `searchChunks` and `randomMock`.
- [ ] **Step 2:** Implement `index.ts` + `types.ts`; `init-db.ts` applies schema to `data/app.db`; `load-chunks.ts` bulk-inserts `chunks.jsonl` and populates FTS. Run tests; expected: PASS.
- [ ] **Step 3:** `randomMock()` returns exactly 150 questions distributed per the blueprint counts (falls back gracefully if a category is short, logging the shortfall). Test the distribution. Commit.

---

### Task 4: MCQ question bank authoring + verification

**Files:**
- Create: `pipeline/questions/` (per-category JSON files), `scripts/load-questions.ts`, `scripts/verify-questions.ts`
- Test: `scripts/verify-questions.test.ts`

**Interfaces:**
- Consumes: `chunks.jsonl` / loaded `chunks`, `insertQuestion`.
- Produces: `questions` table populated; each record `{stem, options[4], answer, justification, source_book, source_page, category, difficulty}`.

- [ ] **Step 1:** `verify-questions.ts`: for each authored question, confirm the cited book+page chunk exists and the justification text overlaps the source chunk (token-overlap threshold). Write failing test with one good + one bad fixture.
- [ ] **Step 2:** Author MCQs across all 14 blueprint categories, proportional to the blueprint counts (initial target: a complete pass covering every category; expand toward ~750 in later batches). Each question grounded in a specific chunk with citation. **This step is dispatched across parallel subagents, one per book/category group.**
- [ ] **Step 3:** Run `verify-questions.ts`; discard/fix failures. Run `load-questions.ts`. Assert every category has ≥ its blueprint count available. Commit questions + scripts.

---

### Task 5: Auth (passcode gate)

**Files:**
- Create: `middleware.ts`, `app/login/page.tsx`, `app/api/login/route.ts`, `lib/auth.ts`
- Test: `lib/auth.test.ts`

**Interfaces:**
- Produces: `verifyPasscode(input): boolean`, `signSession(): string`, `verifySession(cookie): boolean`.

- [ ] **Step 1:** Failing test for `verifySession` round-trip and rejection of tampered cookie (HMAC with `SESSION_SECRET`).
- [ ] **Step 2:** Implement `lib/auth.ts`; login route sets HTTP-only cookie on correct `APP_PASSCODE`, with a simple in-memory rate limit. `middleware.ts` redirects unauthenticated requests (except `/login`, `/api/login`, static) to `/login`. Tests PASS.
- [ ] **Step 3:** Commit.

---

### Task 6: Quiz mode UI + scoring

**Files:**
- Create: `app/quiz/page.tsx`, `app/quiz/session/page.tsx`, `app/api/quiz/start/route.ts`, `app/api/quiz/answer/route.ts`, `app/api/quiz/finish/route.ts`, `components/QuestionCard.tsx`, `components/QuizResult.tsx`
- Test: `app/api/quiz/quiz.test.ts`

**Interfaces:**
- Consumes: db question + attempt functions.
- Produces: quiz session flow (start → answer → finish) returning score vs 60%.

- [ ] **Step 1:** Failing test: start a topic drill of N → get N questions; answer all → finish returns correct count, percentage, pass/fail at 60%.
- [ ] **Step 2:** Implement routes + pages: mode picker (full mock / topic drill / review mistakes), `QuestionCard` (4 options, submit, then reveal correct answer + justification + citation), countdown timer for full mock, `QuizResult` summary. Tests PASS.
- [ ] **Step 3:** Commit.

---

### Task 7: Score dashboard

**Files:**
- Create: `app/dashboard/page.tsx`, `app/api/stats/route.ts`, `components/CategoryBars.tsx`
- Test: `app/api/stats/stats.test.ts`

- [ ] **Step 1:** Failing test: `attemptStats()` aggregates per-category accuracy across attempts.
- [ ] **Step 2:** Dashboard shows overall score trend, per-category accuracy vs the 60% line, and weakest 3 categories. Tests PASS. Commit.

---

### Task 8: Ask mode (retrieval + Claude Sonnet 5)

**Files:**
- Create: `app/ask/page.tsx`, `app/api/ask/route.ts`, `lib/anthropic.ts`, `components/ChatMessage.tsx`
- Test: `lib/anthropic.test.ts` (mocks the SDK)

**Interfaces:**
- Consumes: `searchChunks`, `saveChatMessage`, `listChatMessages`.
- Produces: `askGrounded(question, chunks): {answer, sources}` calling `claude-sonnet-5`.

- [ ] **Step 1:** Failing test (mocked SDK): system prompt includes retrieved passages and the "answer only from these passages; cite book+page; say when not covered" instruction; model id is `claude-sonnet-5`.
- [ ] **Step 2:** Implement `lib/anthropic.ts` (SDK, `max_tokens` ~2000, streaming with `getFinalMessage`), `/api/ask` route (retrieve top ~8 chunks → call model → persist messages), chat UI with source list. API failure → JSON error the UI shows with a retry button. Tests PASS.
- [ ] **Step 3:** Commit.

---

### Task 9: End-to-end smoke tests + docs

**Files:**
- Create: `tests/e2e/smoke.spec.ts`, `README.md`, `DEPLOY.md`

- [ ] **Step 1:** Playwright smoke: login → start a 5-question drill → answer → see score; open Ask, submit a question (Ask test skipped/mocked if no `ANTHROPIC_API_KEY`).
- [ ] **Step 2:** `README.md`: setup, `.env`, run pipeline, init/load db, `npm run dev`. `DEPLOY.md`: how to move to Supabase/pgvector + Vercel later (swap `lib/db`, set Vercel env vars). Run smoke via `~/.claude/tools/webapp-testing-scripts/with_server.py`. Commit.

## Self-Review

- **Spec coverage:** quiz (mock/drill/review) → T6; score tracking → T3/T7; Ask grounded + cited → T8; blueprint weighting → T3; pipeline extract/chunk/load → T2/T3; question bank + verification → T4; auth → T5; testing → T9. Supabase/Vercel intentionally deferred (documented in DEPLOY.md) per autonomous local-first decision.
- **Placeholders:** none — each task has concrete files, interfaces, and test criteria.
- **Type consistency:** db function names in T3 interfaces are the names consumed in T6/T7/T8.
