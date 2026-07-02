# Authored question bank

This directory holds hand/AI-authored MCQ questions, one JSON file per
blueprint category: `pipeline/questions/<category>.json` (e.g.
`pipeline/questions/periodontics.json`). The 14 valid category values are
the `BlueprintCategory` union in `lib/db/types.ts`:

```
scientific_knowledge, patient_assessment, treatment_planning, health_safety,
emergencies, prevention_population, pain_anxiety, periodontics, pediatric,
orthodontics, restorative_endodontics, prosthodontics,
oral_surgery_medicine, affective_skills
```

## File format

Each file is a JSON array of question objects with these fields:

| Field           | Type              | Notes                                                                 |
|-----------------|-------------------|------------------------------------------------------------------------|
| `stem`          | `string`          | The question text. Non-empty.                                         |
| `options`       | `string[]`        | Exactly 4 answer choices.                                             |
| `answer_index`  | `number` (0-3)    | Index into `options` of the correct answer.                           |
| `justification` | `string`          | Explanation of the correct answer, grounded in the cited source text. |
| `source_book`   | `string`          | Must match a `book` value in `pipeline/output/chunks.jsonl`.          |
| `source_page`   | `number`          | Must fall within a chunk's `[page_start, page_end]` for that book.    |
| `category`      | `string`          | One of the 14 blueprint categories listed above.                      |
| `difficulty`    | `string`          | One of `"easy"`, `"medium"`, `"hard"`.                                |

### Example

```json
[
  {
    "stem": "What instrument is used to measure periodontal probing depth?",
    "options": ["Explorer", "Periodontal probe", "Curette", "Scaler"],
    "answer_index": 1,
    "justification": "Periodontal probing depth is measured using a calibrated periodontal probe from the gingival margin to the base of the pocket, and increased depths indicate attachment loss.",
    "source_book": "Clinical Periodontology",
    "source_page": 41,
    "category": "periodontics",
    "difficulty": "easy"
  }
]
```

## Grounding requirement

Every question must cite a real chunk from `pipeline/output/chunks.jsonl`
(matched by `source_book` + `source_page` falling inside a chunk's page
range), and the `justification` must share at least 5 meaningful
(lowercased, non-stopword, length >= 3) tokens with that chunk's text. This
is enforced by `scripts/verify-questions.ts` — do not author questions that
can't pass it.

## Running verification

```bash
npm run questions:verify
```

Loads every `pipeline/questions/*.json` file, validates each question
(structure, source-chunk existence, justification grounding), and prints a
pass/fail report per file and per question. Exits non-zero if any question
fails.

If `pipeline/questions/` is missing or contains no files, the script reports
"0 questions, nothing to verify" and exits **0** (not a failure) — this lets
the tooling be exercised before any categories have been authored. Pass
`--strict` to instead treat "0 questions" as a failure (exit 1):

```bash
npm run questions:verify -- --strict
```

## Loading into the database

```bash
npm run questions:load
```

Runs the same verification as `questions:verify` first; if any question
fails, nothing is written. On success, it **clears the existing `questions`
table** (and dependent `answers` rows) and re-inserts the full, freshly
verified set from the JSON files, so re-running the loader is always safe
and never produces duplicates — the DB always ends up mirroring exactly
what's in `pipeline/questions/*.json`.

### Field mapping (authored JSON -> `NewQuestion` / `questions` table)

| Authored field   | `NewQuestion` field  | Notes                                             |
|------------------|-----------------------|----------------------------------------------------|
| `stem`           | `stem`                 | direct                                              |
| `options`        | `choices`               | direct                                              |
| `answer_index`   | `correct_index`         | direct                                              |
| `justification`  | `explanation`           | direct                                              |
| `category`       | `category`              | direct                                              |
| `source_book` + `source_page` | `source_chunk_id` | resolved to the matching chunk's `id` via `findMatchingChunk` |
| `difficulty`     | *(dropped)*             | no corresponding column in the `questions` table    |
