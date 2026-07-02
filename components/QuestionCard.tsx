"use client";

import { useState } from "react";

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

  async function handleSubmit() {
    if (selectedIndex === null || submitting) return;
    setSubmitting(true);
    try {
      const res = await onSubmit(selectedIndex);
      setResult(res);
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    setSelectedIndex(null);
    setResult(null);
    onNext();
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-xl mx-auto p-4">
      <p className="text-sm text-black/60 dark:text-white/60">
        Question {questionNumber} of {totalQuestions}
      </p>
      <h2 className="text-lg font-semibold">{question.stem}</h2>

      <div className="flex flex-col gap-2">
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
              type="button"
              disabled={!!result}
              onClick={() => setSelectedIndex(i)}
              className={`text-left rounded-xl border px-4 py-3 text-base transition-colors disabled:cursor-default ${stateClasses}`}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {!result && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selectedIndex === null || submitting}
          className="rounded-full border border-solid border-transparent bg-foreground text-background font-medium text-base h-12 px-5 w-full disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      )}

      {result && (
        <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] dark:border-white/[.145] p-4">
          <p className={`font-semibold ${result.correct ? "text-green-700" : "text-red-700"}`}>
            {result.correct ? "Correct" : "Incorrect"}
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
            onClick={handleNext}
            className="rounded-full border border-solid border-transparent bg-foreground text-background font-medium text-base h-12 px-5 w-full"
          >
            {questionNumber < totalQuestions ? "Next question" : "Finish"}
          </button>
        </div>
      )}
    </div>
  );
}
