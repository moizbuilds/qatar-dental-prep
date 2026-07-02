# Qatar Dental Prep

**Live:** https://qatar-dental-prep.vercel.app (passcode-gated). Hosted on
Vercel with a Supabase Postgres backend.

A personal, mobile-friendly study app for the Qatar MOPH **National General
Dental Qualifying Examination** (150 MCQs, 3½ hours, 60% pass). Everything is
grounded in the official reading-list textbooks.

Two modes:

- **Quiz** — a bank of 275 verified MCQs (every question cites a textbook
  page). Full 150-question mocks weighted to the exam blueprint with a
  3½-hour timer, topic drills, and a review-your-mistakes mode. A dashboard
  tracks your score trend, per-category accuracy against the 60% line, and
  your weakest areas. Works entirely offline.
- **Ask** — free-form questions answered by Claude Sonnet 5, grounded only in
  your textbooks, with book + page citations (and an honest "the books don't
  cover this" when they don't).

## Stack

Next.js 15 (App Router, TypeScript) · SQLite (better-sqlite3) with FTS5
full-text search · Tailwind CSS · Anthropic API (`claude-sonnet-5`) ·
Python + pypdf for the ingestion pipeline. Single-user, protected by a
passcode. The data layer is isolated behind `lib/db/*` so a later move to
Supabase/pgvector + Vercel is a config swap — see [DEPLOY.md](DEPLOY.md).

## Setup

Requires Node 20+ and Python 3.9+.

```bash
# 1. Install dependencies
npm install
pip3 install -r pipeline/requirements.txt

# 2. Configure environment
cp .env.example .env.local
#   - ANTHROPIC_API_KEY : your key (Ask mode only; quiz works without it)
#   - APP_PASSCODE      : the passcode you'll type to enter the app
#   - SESSION_SECRET    : node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Build the source corpus from the textbooks
#    Point the pipeline at your PDF folder if different (see pipeline/books.json).
python3 pipeline/extract.py    # PDFs -> pipeline/output/pages.jsonl
python3 pipeline/chunk.py      # pages -> pipeline/output/chunks.jsonl

# 4. Initialise the database and load content
npm run db:init                # create data/app.db schema
npm run db:load                # load text chunks (for Ask-mode retrieval)
npm run questions:load         # verify + load the 275-question bank

# 5. Run
npm run dev                    # http://localhost:3000
```

Log in with your `APP_PASSCODE`.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` | Run / build the app |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run questions:verify` | Check every authored question is grounded in a cited chunk |
| `npm run questions:load` | Verify then load the question bank (refuses to wipe recorded answers without `--force`) |
| `python3 pipeline/selfcheck_questions.py <file>` | Validate one authored question file |

## Adding more questions

Question files live in `pipeline/questions/<category>.json`, one file per
blueprint category. Each question cites a real chunk (verbatim `source_book`
+ a `source_page` inside that chunk's range) and its `justification` must
share wording with the cited text. See
[pipeline/questions/README.md](pipeline/questions/README.md) for the schema,
then `npm run questions:verify` and `npm run questions:load --force`.

## Notes / known gaps

- The Nayak *General and Systemic Pathology* PDF in the source set was a
  0-byte download and is excluded; general pathology is covered by the other
  books. Re-download it and re-run the pipeline to add it.
- Vander's *Human Physiology* extracted with a garbled text layer (few usable
  words per page) and contributes little; physiology is better covered by
  *Essential Physiology for Dental Students*.
- Question difficulty is authored but not yet stored (no DB column) — a future
  enhancement if adaptive difficulty is wanted.
