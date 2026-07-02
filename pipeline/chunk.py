#!/usr/bin/env python3
"""Merge per-page extracted text into ~800-token chunks with ~100-token overlap.

Reads pipeline/output/pages.jsonl (written by extract.py), groups pages by
book, and greedily merges whole pages into chunks targeting TARGET_TOKENS
estimated tokens, with the final ~OVERLAP_TOKENS worth of trailing pages
repeated at the start of the next chunk. page_start/page_end are preserved
per chunk. Writes pipeline/output/chunks.jsonl:

    {"id": "<book_slug>-<n>", "book": "<clean title>", "page_start": <int>,
     "page_end": <int>, "category_hint": "<one of 14>", "text": "<chunk text>"}

Token estimate: whitespace-word-count * 1.3 (matches the brief's spec;
deliberately not a real tokenizer since none is required at build time).

Usage:
    python3 pipeline/chunk.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent
BOOKS_JSON = PIPELINE_DIR / "books.json"
OUTPUT_DIR = PIPELINE_DIR / "output"
PAGES_JSONL = OUTPUT_DIR / "pages.jsonl"
CHUNKS_JSONL = OUTPUT_DIR / "chunks.jsonl"

TARGET_TOKENS = 800
OVERLAP_TOKENS = 100
TOKENS_PER_WORD = 1.3


def estimate_tokens(text: str) -> float:
    """Whitespace-word-count * 1.3, per the brief's token estimate spec."""
    if not text or not text.strip():
        return 0.0
    return len(text.split()) * TOKENS_PER_WORD


def slugify(title: str) -> str:
    slug = title.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug


def chunk_pages(
    pages: list[dict],
    book: str,
    category_hint: str,
    book_slug: str | None = None,
) -> list[dict]:
    """Greedily merge whole pages into ~TARGET_TOKENS chunks with page-level overlap.

    `pages` must be in ascending page order and share the same book. Pages
    with blank/whitespace-only text are dropped before chunking. Overlap is
    achieved by walking back from the end of the just-completed chunk,
    re-including trailing pages until ~OVERLAP_TOKENS worth of tokens is
    covered, and starting the next chunk from there.
    """
    if book_slug is None:
        book_slug = slugify(book)

    usable = [p for p in pages if p.get("text", "").strip()]
    if not usable:
        return []

    chunks: list[dict] = []
    start_idx = 0
    n = len(usable)

    while start_idx < n:
        idx = start_idx
        token_total = 0.0
        page_texts: list[str] = []

        # Always include at least one page, even if it alone exceeds the target,
        # so a single huge page doesn't stall the loop.
        while idx < n:
            page_tokens = estimate_tokens(usable[idx]["text"])
            if page_texts and token_total + page_tokens > TARGET_TOKENS:
                break
            page_texts.append(usable[idx]["text"])
            token_total += page_tokens
            idx += 1

        chunk_pages_slice = usable[start_idx:idx]
        chunk = {
            "id": f"{book_slug}-{len(chunks)}",
            "book": book,
            "page_start": chunk_pages_slice[0]["page"],
            "page_end": chunk_pages_slice[-1]["page"],
            "category_hint": category_hint,
            "text": "\n\n".join(page_texts),
        }
        chunks.append(chunk)

        if idx >= n:
            break

        # Compute overlap: walk back from idx-1 accumulating tokens until we
        # cover ~OVERLAP_TOKENS, then resume the next chunk from there. This
        # guarantees forward progress (next start_idx > current start_idx)
        # while still repeating some trailing context.
        overlap_tokens = 0.0
        back_idx = idx - 1
        while back_idx > start_idx and overlap_tokens < OVERLAP_TOKENS:
            overlap_tokens += estimate_tokens(usable[back_idx]["text"])
            back_idx -= 1
        next_start = back_idx + 1
        # Guarantee forward progress even if a single page's tokens alone
        # exceed OVERLAP_TOKENS (back_idx would not have moved from idx-1).
        next_start = max(next_start, start_idx + 1)
        start_idx = next_start

    return chunks


def load_books() -> dict[str, dict]:
    with open(BOOKS_JSON, encoding="utf-8") as f:
        return json.load(f)


def load_pages_by_book() -> dict[str, list[dict]]:
    """Group pages.jsonl records by book title, preserving ascending page order."""
    by_book: dict[str, list[dict]] = {}
    with open(PAGES_JSONL, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            by_book.setdefault(record["book"], []).append(record)
    for pages in by_book.values():
        pages.sort(key=lambda p: p["page"])
    return by_book


def main() -> None:
    if not PAGES_JSONL.exists():
        print(f"ERROR: {PAGES_JSONL} not found. Run extract.py first.", file=sys.stderr)
        sys.exit(1)

    books = load_books()
    # title -> category_hint, and title -> a stable slug derived from the filename
    title_to_meta = {}
    for filename, meta in books.items():
        title_to_meta[meta["title"]] = {
            "category_hint": meta["category_hint"],
            "slug": slugify(Path(filename).stem),
        }

    pages_by_book = load_pages_by_book()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    total_chunks = 0
    summary = []

    with open(CHUNKS_JSONL, "w", encoding="utf-8") as out:
        for title, pages in pages_by_book.items():
            meta = title_to_meta.get(title)
            if meta is None:
                print(f"WARNING: '{title}' found in pages.jsonl but not in books.json, skipping", file=sys.stderr)
                continue

            chunks = chunk_pages(
                pages,
                book=title,
                category_hint=meta["category_hint"],
                book_slug=meta["slug"],
            )
            for c in chunks:
                out.write(json.dumps(c, ensure_ascii=False) + "\n")
            total_chunks += len(chunks)
            summary.append((title, len(pages), len(chunks)))

    print(f"Wrote {total_chunks} chunks -> {CHUNKS_JSONL}\n")
    print("=== Per-book summary ===")
    for title, page_count, chunk_count in summary:
        flag = " <-- ZERO CHUNKS" if chunk_count == 0 else ""
        print(f"{title}: pages={page_count} chunks={chunk_count}{flag}")


if __name__ == "__main__":
    main()
