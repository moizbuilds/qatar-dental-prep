#!/usr/bin/env python3
"""Standalone self-check for a single authored question file.

Mirrors the grounding + structural rules enforced by
scripts/verify-questions.ts so an author can validate ONE
pipeline/questions/<category>.json file in isolation (without seeing other
authors' in-progress files). The authoritative check remains
`npm run questions:verify`; this is a fast pre-flight that uses the same
tokenizer, stopword list, and MIN_SHARED_TOKENS threshold.

Usage:
    python3 pipeline/selfcheck_questions.py pipeline/questions/periodontics.json

Exits 0 if every question passes, 1 otherwise (printing each failure).
"""
import json
import re
import sys
from pathlib import Path

MIN_SHARED_TOKENS = 5
CHUNKS_PATH = Path(__file__).resolve().parent / "output" / "chunks.jsonl"
VALID_CATEGORIES = {
    "scientific_knowledge", "patient_assessment", "treatment_planning",
    "health_safety", "emergencies", "prevention_population", "pain_anxiety",
    "periodontics", "pediatric", "orthodontics", "restorative_endodontics",
    "prosthodontics", "oral_surgery_medicine", "affective_skills",
}
VALID_DIFFICULTY = {"easy", "medium", "hard"}
STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "then", "else", "of", "to", "in", "on", "for",
    "with", "as", "by", "at", "from", "is", "are", "was", "were", "be", "been", "being", "this",
    "that", "these", "those", "it", "its", "into", "than", "which", "who", "whom", "their", "there",
    "not", "no", "can", "will", "would", "should", "may", "might", "must", "also", "such", "each",
    "any", "all", "more", "most", "other", "some", "when", "where", "how", "what", "why", "does",
    "do", "did", "has", "have", "had", "you", "your", "we", "our", "they", "them", "he", "she",
    "his", "her", "i", "my", "me", "so", "because", "about", "over", "under", "between", "during",
}
_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)


def tokenize(text):
    return {t for t in (m.group(0).lower() for m in _TOKEN_RE.finditer(text))
            if len(t) >= 3 and t not in STOPWORDS}


def load_chunks():
    by_book = {}
    if not CHUNKS_PATH.exists():
        print(f"ERROR: {CHUNKS_PATH} not found. Run the extraction/chunking pipeline first.", file=sys.stderr)
        sys.exit(2)
    with open(CHUNKS_PATH) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                c = json.loads(line)
            except json.JSONDecodeError:
                continue
            by_book.setdefault(c["book"].lower(), []).append(c)
    return by_book


def find_chunk(by_book, book, page):
    for c in by_book.get(book.lower(), []):
        if c["page_start"] <= page <= c["page_end"]:
            return c
    return None


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    path = Path(sys.argv[1])
    questions = json.loads(path.read_text())
    if not isinstance(questions, list):
        print("FAIL: file must be a JSON array of question objects")
        sys.exit(1)
    by_book = load_chunks()
    failures = 0
    for i, q in enumerate(questions):
        errs = []
        if not isinstance(q.get("stem"), str) or not q["stem"].strip():
            errs.append("empty/missing stem")
        opts = q.get("options")
        if not isinstance(opts, list) or len(opts) != 4 or not all(isinstance(o, str) and o.strip() for o in opts):
            errs.append("options must be exactly 4 non-empty strings")
        ai = q.get("answer_index")
        if not isinstance(ai, int) or not (0 <= ai <= 3):
            errs.append("answer_index must be an int 0-3")
        just = q.get("justification")
        if not isinstance(just, str) or not just.strip():
            errs.append("empty/missing justification")
        if q.get("category") not in VALID_CATEGORIES:
            errs.append(f"invalid category {q.get('category')!r}")
        if q.get("difficulty") not in VALID_DIFFICULTY:
            errs.append(f"invalid difficulty {q.get('difficulty')!r}")
        book, page = q.get("source_book"), q.get("source_page")
        chunk = None
        if not isinstance(book, str) or not isinstance(page, int):
            errs.append("source_book must be string and source_page must be int")
        else:
            chunk = find_chunk(by_book, book, page)
            if chunk is None:
                errs.append(f"no chunk found for book={book!r} page={page} (check verbatim title + page range)")
        if chunk is not None and isinstance(just, str):
            shared = len(tokenize(just) & tokenize(chunk["text"]))
            if shared < MIN_SHARED_TOKENS:
                errs.append(f"justification shares only {shared} meaningful token(s) with source (need >= {MIN_SHARED_TOKENS})")
        if errs:
            failures += 1
            print(f"[Q{i}] FAIL: " + "; ".join(errs))
    total = len(questions)
    if failures:
        print(f"\n{failures}/{total} question(s) FAILED in {path.name}")
        sys.exit(1)
    print(f"OK: all {total} question(s) passed in {path.name}")


if __name__ == "__main__":
    main()
