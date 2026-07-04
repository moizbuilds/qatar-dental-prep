"use client";

import { useRef, useState } from "react";

const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F"];

export interface PublicQuestion {
  id: number;
  category: string;
  stem: string;
  choices: string[];
}

export interface AnswerResult {
  correct: boolean;
  correctIndex: number;
  explanation: string | null;
  citation: { book: string; page_start: number } | null;
}

interface QuestionCardProps {
  question: PublicQuestion;
  questionNumber: number;
  totalQuestions: number;
  onSubmit: (selectedIndex: number) => Promise<AnswerResult>;
  onNext: () => void;
}

export default function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  onSubmit,
  onNext,
}: QuestionCardProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keyboard support for the radiogroup: arrow keys move the selection,
  // number keys (1–N) jump straight to a choice, Enter submits. This is what a
  // student rapid-firing through a mock wants, and it satisfies the WAI-ARIA
  // radiogroup keyboard contract.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (result) return;
    const count = question.choices.length;
    const focusChoice = (i: number) => {
      setSelectedIndex(i);
      optionRefs.current[i]?.focus();
    };
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      focusChoice(selectedIndex === null ? 0 : (selectedIndex + 1) % count);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      focusChoice(selectedIndex === null ? count - 1 : (selectedIndex - 1 + count) % count);
    } else if (/^[1-9]$/.test(e.key)) {
      const i = Number(e.key) - 1;
      if (i < count) {
        e.preventDefault();
        focusChoice(i);
      }
    } else if (e.key === "Enter" && selectedIndex !== null) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  async function handleSubmit() {
    if (selectedIndex === null || submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const res = await onSubmit(selectedIndex);
      setResult(res);
    } catch {
      // Submission failed (network / server). Do NOT fabricate a result — a
      // missing/undefined result would render as a wrong "Incorrect". Show a
      // retry instead so the answer can actually be graded.
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    setSelectedIndex(null);
    setResult(null);
    setSubmitError(false);
    onNext();
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-xl mx-auto p-4">
      <p className="text-sm text-black/60 dark:text-white/60">
        Question {questionNumber} of {totalQuestions}
      </p>
      <h2 className="text-lg font-semibold">{question.stem}</h2>

      <div
        role="radiogroup"
        aria-label="Answer choices"
        onKeyDown={handleKeyDown}
        className="flex flex-col gap-2"
      >
        {question.choices.map((choice, i) => {
          const isSelected = selectedIndex === i;
          const isCorrectChoice = result && i === result.correctIndex;
          const isWrongSelected = result && isSelected && !result.correct;

          let stateClasses = "border-black/[.08] dark:border-white/[.145]";
          if (result) {
            if (isCorrectChoice) {
              stateClasses = "border-green-600 bg-green-50 dark:bg-green-950";
            } else if (isWrongSelected) {
              stateClasses = "border-red-600 bg-red-50 dark:bg-red-950";
            }
          } else if (isSelected) {
            stateClasses = "border-foreground";
          }

          return (
            <button
              key={i}
              ref={(el) => {
                optionRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={!!result}
              onClick={() => setSelectedIndex(i)}
              className={`flex items-start gap-3 text-left rounded-xl border px-4 py-3 text-base transition-colors disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${stateClasses}`}
            >
              <span aria-hidden className="font-mono text-sm text-black/50 dark:text-white/50 pt-0.5">
                {CHOICE_LETTERS[i] ?? i + 1}
              </span>
              <span>{choice}</span>
            </button>
          );
        })}
      </div>

      {!result && (
        <div className="flex flex-col gap-2">
          {submitError && (
            <p className="text-sm text-red-600 text-center" role="alert">
              Couldn&apos;t submit your answer. Check your connection and try again.
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selectedIndex === null || submitting}
            className="rounded-full border border-solid border-transparent bg-foreground text-background font-medium text-base h-12 px-5 w-full disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {submitting ? "Submitting..." : submitError ? "Retry" : "Submit"}
          </button>
        </div>
      )}

      {result && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-3 rounded-xl border border-black/[.08] dark:border-white/[.145] p-4"
        >
          <p className={`font-semibold ${result.correct ? "text-green-700" : "text-red-700"}`}>
            {result.correct ? "✓ Correct" : "✗ Incorrect"}
          </p>
          {result.explanation && (
            <p className="text-sm">{result.explanation}</p>
          )}
          {result.citation && (
            <p className="text-xs text-black/60 dark:text-white/60">
              Source: {result.citation.book}, p.{result.citation.page_start}
            </p>
          )}
          <button
            type="button"
            autoFocus
            onClick={handleNext}
            className="rounded-full border border-solid border-transparent bg-foreground text-background font-medium text-base h-12 px-5 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {questionNumber < totalQuestions ? "Next question" : "Finish"}
          </button>
        </div>
      )}
    </div>
  );
}
