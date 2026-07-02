# Qatar Dental Exam Prep App — Design Spec

**Date:** 2026-07-02
**Status:** Approved by Moiz (2026-07-02)

## Purpose

A personal, mobile-friendly web app for studying for the Qatar MOPH **National General Dental Qualifying Examination** (150 MCQs, 3.5 hours, 60% passing score). All content is grounded in the 37 usable textbooks in `~/Downloads/Dental Books`, which map to the exam's official reading list.

Single user, protected by a passcode. No public signup.

**Known gap:** `Nayak R. - General and Systemic Pathology` PDF is 0 bytes (corrupted download). General pathology content will come from the other books until it is re-downloaded. The two duplicate blueprint PDFs count as one source.

## Exam blueprint (drives quiz weighting)

From the official MOPH blueprint PDF (150 items total):

| Section | Items |
|---|---|
| 1. Scientific Knowledge (biomedical 30, evidence-based practice 5) | 35 |
| 2.1 Patient Assessment and Diagnosis | 10 |
| 2.2 Comprehensive Treatment Planning | 6 |
| 2.3 Health and Safety | 6 |
| 2.4 Management of Emergencies | 6 |
| 2.5 Disease Prevention / Oral Health Promotion / Population Health | 6 |
| 2.6 Control of Pain and Anxiety | 5 |
| 2.7 Periodontics | 10 |
| 2.8 Pediatric Dentistry | 10 |
| 2.9 Orthodontics | 5 |
| 2.10 Restorative Dentistry and Endodontics | 16 |
| 2.11 Prosthodontics | 10 |
| 2.12 Oral Surgery and Oral Medicine | 10 |
| 3. Affective Skills (communication 6, professionalism 4, ethics/legal 3, teamwork 2) | 15 |

## Two modes

### 1. Quiz mode — pre-generated question bank, near-zero runtime cost

- Question bank of **~750 MCQs** (5× the exam size), generated during the build by Claude Code from the textbook content, distributed proportionally to the blueprint categories above.
- Each question record: stem, 4 options (A–D), correct answer, justification paragraph, source (book title + chapter/page), blueprint category, difficulty (easy/medium/hard).
- Every generated question passes a **verification step** before entering the bank: the stated answer is checked against the cited source passage; failures are discarded or fixed.
- Quiz modes:
  - **Full mock:** 150 questions sampled per blueprint distribution, 3.5-hour countdown timer, scored against the 60% pass line.
  - **Topic drill:** user picks a category and count (e.g. 20 endodontics questions).
  - **Review mistakes:** re-quiz on previously missed questions.
- **Score tracking:** every attempt and per-question answer stored. Dashboard shows score trend over time, per-category accuracy vs 60%, and weakest topics.
- No LLM calls at runtime — quiz mode works even if the API is down or the budget is zero.

### 2. Ask mode — live Q&A grounded in the textbooks

- Free-form question box (works like a tutor chat).
- Retrieval: hybrid search over textbook chunks in Supabase — Postgres full-text search + pgvector similarity using **Supabase's built-in embedding model (gte-small via Edge Function)**. Both free; no external embedding API.
- Top ~8 chunks are sent to **Claude Sonnet 5 (`claude-sonnet-5`)** via a server-side API route. The system prompt instructs Claude to:
  - answer **only** from the provided passages,
  - cite book + page for each claim,
  - explicitly say when the books don't cover the question (no guessing),
  - explain at the level of an exam candidate.
- Chat history persisted per session so explanations can be revisited.
- Estimated cost: ~$0.015/question (Sonnet 5 intro pricing); ~$10–15/month at heavy daily study.

## Build pipeline (one-time, run in Claude Code)

1. **Extract:** pull text from all PDFs (pypdf; OCR not expected to be needed — books are digital-native), record page numbers.
2. **Chunk:** ~800-token chunks with ~100-token overlap, tagged `{book, chapter?, page_start, page_end, blueprint_category?}`.
3. **Load:** insert chunks into Supabase; build full-text (tsvector) index; generate embeddings via Supabase Edge Function (gte-small, 384-dim) into a pgvector column.
4. **Generate question bank:** per blueprint category, select source material and generate MCQs with justification + citation; run the verification pass; insert accepted questions.

## Architecture

- **Frontend/backend:** Next.js (App Router) deployed on Vercel. Responsive UI, usable on phone.
- **Database:** Supabase Postgres.
- **LLM:** Anthropic API (`claude-sonnet-5`), called only from Next.js server routes; the API key lives in Vercel env vars and never reaches the browser.
- **Auth:** single shared passcode, checked server-side, sets an HTTP-only session cookie. All API routes require the session.

### Tables

| Table | Purpose |
|---|---|
| `chunks` | textbook text chunks: content, book, pages, tsvector, embedding (vector 384) |
| `questions` | MCQ bank: stem, options, answer, justification, source, category, difficulty |
| `quiz_attempts` | one row per quiz session: mode, category, started/finished, score |
| `answers` | per-question responses within an attempt: question_id, chosen, correct, time |
| `chat_messages` | Ask-mode history: role, content, cited sources |

## Error handling

- Ask mode: Claude API failure → user-visible error with retry button; rate-limit (429) retried automatically by the SDK.
- Retrieval returns nothing relevant → Claude is still called but will respond "not covered in the books" per the system prompt; UI shows the (empty) source list honestly.
- Quiz mode has no external dependencies at runtime.
- Passcode brute-force: small server-side rate limit on the login route.

## Testing

- Pipeline: spot-check extracted text and page mapping on 3 books of different formats; verify chunk counts and embedding coverage.
- Question bank: automated verification pass (answer vs source) + manual spot review of a sample per category.
- App: Playwright smoke tests (login, start a drill, answer questions, see score; ask a question, get a cited answer) via the webapp-testing toolkit.

## Out of scope (YAGNI)

- Multi-user accounts, sharing, or public deployment hardening
- Spaced-repetition scheduling (could be added later)
- Image-based questions (radiographs) — bank is text-only for v1
- OCR for scanned pages (revisit only if extraction reveals scanned books)
