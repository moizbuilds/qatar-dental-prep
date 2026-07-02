#!/usr/bin/env python3
"""Unit tests for pipeline/chunk.py's chunking logic.

Self-contained assert-based test (no pytest dependency required), but also
runnable under pytest since every test_* function takes no fixtures and
uses plain asserts.

Run with either:
    python3 pipeline/test_chunk.py
    python3 -m pytest pipeline/test_chunk.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from chunk import estimate_tokens, chunk_pages, TARGET_TOKENS, OVERLAP_TOKENS


def make_page(page_num: int, word_count: int, word: str = "word") -> dict:
    """Build a synthetic page record with `word_count` whitespace-separated words."""
    text = " ".join(f"{word}{i}" for i in range(word_count))
    return {"book": "Synthetic Book", "page": page_num, "text": text}


def test_estimate_tokens_basic():
    # 10 whitespace words * 1.3 = 13
    assert estimate_tokens("one two three four five six seven eight nine ten") == 13


def test_estimate_tokens_empty():
    assert estimate_tokens("") == 0
    assert estimate_tokens("   ") == 0


def test_single_small_page_yields_one_chunk():
    pages = [make_page(1, 50)]
    chunks = chunk_pages(pages, book="Synthetic Book", category_hint="scientific_knowledge")
    assert len(chunks) == 1
    assert chunks[0]["page_start"] == 1
    assert chunks[0]["page_end"] == 1
    assert chunks[0]["book"] == "Synthetic Book"
    assert chunks[0]["category_hint"] == "scientific_knowledge"


def test_chunk_id_format():
    pages = [make_page(1, 50)]
    chunks = chunk_pages(
        pages, book="Synthetic Book", category_hint="scientific_knowledge", book_slug="synthetic-book"
    )
    assert chunks[0]["id"] == "synthetic-book-0"


def test_chunk_size_approximately_target():
    # Enough words across many pages to force multiple chunks.
    # Each page ~100 words -> ~130 tokens. Need several pages per chunk to hit ~800 tokens.
    pages = [make_page(n, 100) for n in range(1, 21)]  # 20 pages, 2000 words, 2600 tokens total
    chunks = chunk_pages(pages, book="Synthetic Book", category_hint="scientific_knowledge")

    assert len(chunks) > 1, "expected multiple chunks from 2600 estimated tokens"

    for c in chunks[:-1]:  # all but the last should be close to the target size
        tokens = estimate_tokens(c["text"])
        # Allow some slack since we merge whole pages, not partial pages.
        assert tokens <= TARGET_TOKENS * 1.5, f"chunk too large: {tokens} tokens"
        assert tokens >= TARGET_TOKENS * 0.4, f"chunk too small: {tokens} tokens"


def test_chunks_overlap():
    pages = [make_page(n, 100) for n in range(1, 21)]
    chunks = chunk_pages(pages, book="Synthetic Book", category_hint="scientific_knowledge")
    assert len(chunks) > 1

    for prev, curr in zip(chunks, chunks[1:]):
        # Overlap is implemented at page granularity: the next chunk's
        # page_start should be <= the previous chunk's page_end, proving
        # some page(s) of text are shared between consecutive chunks.
        assert curr["page_start"] <= prev["page_end"], (
            f"expected overlap between chunks: prev page_end={prev['page_end']}, "
            f"curr page_start={curr['page_start']}"
        )
        # And overlap shouldn't re-include the entire previous chunk.
        assert curr["page_start"] > prev["page_start"]


def test_page_start_end_monotonic_and_covers_all_pages():
    pages = [make_page(n, 100) for n in range(1, 21)]
    chunks = chunk_pages(pages, book="Synthetic Book", category_hint="scientific_knowledge")

    assert chunks[0]["page_start"] == 1
    assert chunks[-1]["page_end"] == 20
    # Every page should be covered by at least one chunk (no gaps).
    covered = set()
    for c in chunks:
        covered.update(range(c["page_start"], c["page_end"] + 1))
    assert covered == set(range(1, 21))


def test_empty_pages_list_yields_no_chunks():
    chunks = chunk_pages([], book="Synthetic Book", category_hint="scientific_knowledge")
    assert chunks == []


def test_pages_with_blank_text_are_skipped():
    pages = [
        make_page(1, 50),
        {"book": "Synthetic Book", "page": 2, "text": ""},
        {"book": "Synthetic Book", "page": 3, "text": "   "},
        make_page(4, 50),
    ]
    chunks = chunk_pages(pages, book="Synthetic Book", category_hint="scientific_knowledge")
    # Should still produce chunks from the non-blank pages only.
    assert len(chunks) >= 1
    for c in chunks:
        assert c["text"].strip() != ""


def test_chunk_ids_are_sequential_and_unique():
    pages = [make_page(n, 100) for n in range(1, 21)]
    chunks = chunk_pages(
        pages, book="Synthetic Book", category_hint="scientific_knowledge", book_slug="synth"
    )
    ids = [c["id"] for c in chunks]
    assert ids == [f"synth-{i}" for i in range(len(chunks))]
    assert len(set(ids)) == len(ids)


def run_all():
    tests = [obj for name, obj in list(globals().items()) if name.startswith("test_") and callable(obj)]
    passed = 0
    failed = []
    for t in tests:
        try:
            t()
            passed += 1
            print(f"PASS {t.__name__}")
        except AssertionError as e:
            failed.append((t.__name__, str(e)))
            print(f"FAIL {t.__name__}: {e}")
    print(f"\n{passed}/{len(tests)} tests passed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    run_all()
