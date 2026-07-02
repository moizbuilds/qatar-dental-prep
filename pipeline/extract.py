#!/usr/bin/env python3
"""Extract per-page text from the dental textbook PDFs listed in books.json.

Reads each PDF with pypdf, emits one JSON object per page to an
intermediate JSONL file (pipeline/output/pages.jsonl):

    {"book": "<clean title>", "page": <1-indexed int>, "text": "<page text>"}

Empty or failed pages are skipped with a logged warning (they carry no
usable content, so they'd just be dead weight in the chunker). Prints a
per-book summary of page count and total extracted characters so quality
can be eyeballed before chunking.

Usage:
    python3 pipeline/extract.py                  # extract all books in books.json
    python3 pipeline/extract.py "Book Title"      # extract a subset (substring match
                                                    # against the clean title or filename)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PdfReadError

PIPELINE_DIR = Path(__file__).resolve().parent
BOOKS_JSON = PIPELINE_DIR / "books.json"
SOURCE_DIR = Path.home() / "Downloads" / "Dental Books"
OUTPUT_DIR = PIPELINE_DIR / "output"
PAGES_JSONL = OUTPUT_DIR / "pages.jsonl"


def load_books() -> dict[str, dict]:
    with open(BOOKS_JSON, encoding="utf-8") as f:
        return json.load(f)


def extract_book(filename: str, title: str) -> tuple[int, int, int]:
    """Extract all pages of one PDF, appending records to PAGES_JSONL.

    Returns (pages_written, pages_skipped, total_chars).
    """
    pdf_path = SOURCE_DIR / filename
    if not pdf_path.exists():
        print(f"WARNING: source file not found, skipping book: {filename}", file=sys.stderr)
        return (0, 0, 0)

    try:
        reader = PdfReader(str(pdf_path))
    except Exception as exc:
        # Broad catch on purpose: a book-level failure (including pypdf
        # DependencyError for encrypted PDFs missing `cryptography`) must
        # log a warning and skip that book, never fail silently.
        print(f"WARNING: failed to open PDF '{filename}': {exc}", file=sys.stderr)
        return (0, 0, 0)

    pages_written = 0
    pages_skipped = 0
    total_chars = 0

    with open(PAGES_JSONL, "a", encoding="utf-8") as out:
        for i, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ""
            except Exception as exc:  # pypdf can raise a variety of parse errors per-page
                print(f"WARNING: failed to extract page {i} of '{title}': {exc}", file=sys.stderr)
                pages_skipped += 1
                continue

            text = text.strip()
            if not text:
                print(f"WARNING: empty text on page {i} of '{title}', skipping", file=sys.stderr)
                pages_skipped += 1
                continue

            record = {"book": title, "page": i, "text": text}
            out.write(json.dumps(record, ensure_ascii=False) + "\n")
            pages_written += 1
            total_chars += len(text)

    return (pages_written, pages_skipped, total_chars)


def main() -> None:
    filters = sys.argv[1:]
    books = load_books()

    if filters:
        selected = {
            fname: meta
            for fname, meta in books.items()
            if any(f.lower() in fname.lower() or f.lower() in meta["title"].lower() for f in filters)
        }
        if not selected:
            print(f"No books matched filters: {filters}", file=sys.stderr)
            sys.exit(1)
    else:
        selected = books
        # Full runs start from a clean slate; filtered/sample runs append so
        # multiple ad-hoc invocations can be combined without clobbering
        # earlier output.
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        if PAGES_JSONL.exists():
            PAGES_JSONL.unlink()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Extracting {len(selected)} book(s) -> {PAGES_JSONL}")
    summary = []
    for filename, meta in selected.items():
        title = meta["title"]
        pages_written, pages_skipped, total_chars = extract_book(filename, title)
        summary.append((title, pages_written, pages_skipped, total_chars))
        print(
            f"  {title}: {pages_written} pages extracted, "
            f"{pages_skipped} skipped, {total_chars} chars"
        )

    print("\n=== Summary ===")
    for title, pages_written, pages_skipped, total_chars in summary:
        flag = " <-- NEAR-EMPTY, may need OCR" if pages_written > 0 and total_chars < 500 else ""
        if pages_written == 0:
            flag = " <-- EXTRACTION FAILED / NO PAGES"
        print(f"{title}: pages={pages_written} skipped={pages_skipped} chars={total_chars}{flag}")


if __name__ == "__main__":
    main()
