# Pipeline

Extracts and chunks the dental textbook PDFs in `~/Downloads/Dental Books` into
retrieval-ready chunks for question authoring.

## Steps

1. **`books.json`** — maps each usable PDF filename to a clean title and a
   blueprint `category_hint` (one of 14 categories). Excludes the 0-byte
   Nayak file and the duplicate blueprint PDF.
2. **`extract.py`** — reads each PDF with `pypdf`, emits one JSON object per
   page to `pipeline/output/pages.jsonl`: `{"book", "page", "text"}`. Empty
   or failed pages are skipped with a logged warning. Prints per-book page
   and character counts so extraction quality can be eyeballed.

   ```bash
   python3 pipeline/extract.py                 # extract all books
   python3 pipeline/extract.py "Book Title"     # extract a subset (substring match)
   ```

   Note: some PDFs are AES-encrypted and require the `cryptography` package
   (`pip3 install cryptography`) for `pypdf` to open them; without it,
   `PdfReader` raises `pypdf.errors.DependencyError` for that file.

3. **`chunk.py`** — merges each book's per-page text into ~800-token chunks
   (~100-token overlap, whole pages only, token estimate = whitespace words
   x 1.3), preserving `page_start`/`page_end`. Writes
   `pipeline/output/chunks.jsonl`: `{"id", "book", "page_start", "page_end",
   "category_hint", "text"}`.

   ```bash
   python3 pipeline/chunk.py
   ```

4. **`test_chunk.py`** — unit tests for the chunking logic (page merging,
   token estimate, overlap, id format). No pytest dependency required.

   ```bash
   python3 pipeline/test_chunk.py
   # or
   python3 -m pytest pipeline/test_chunk.py
   ```

## Output

`pipeline/output/` is gitignored. Regenerate it locally via `extract.py`
then `chunk.py`. As of the last full run: 37 books, 13,455 pages,
11,286 chunks, all 14 category hints represented.

## Flagged books (needs OCR, out of scope)

These two books extracted near-empty with `pypdf` (text-layer extraction
only) and need OCR to be usable. Out of scope for v1; each still produced a
handful of chunks from whatever sparse text layer existed, so the pipeline
does not treat them as hard failures:

- **Dental Hygiene Practice Guidance (DHP-06-2025-EN)** — 4 pages extracted, 3 chunks.
- **Integrated Dental Treatment Planning: A Case-Based Approach** — 2 pages extracted, 2 chunks.

### Known quality issue (not flagged as needing OCR, but worth noting)

**Vander's Human Physiology: The Mechanisms of Body Function** extracted a
full 853 pages, but the text layer is largely garbled/fragmented (dense
biochemistry diagrams and formulas render as broken tokens), averaging only
~7 words of usable text per page. This produced just 12 chunks despite the
long page count. It clears the ">0 chunks" bar and its `category_hint`
(`scientific_knowledge`) has ample coverage from other books, so it was not
treated as a hard failure, but its content is low-value for question
authoring and a candidate for OCR/re-extraction in a future pass.
