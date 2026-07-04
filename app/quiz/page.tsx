"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BLUEPRINT, type BlueprintCategory } from "../../lib/db/types";

function formatCategory(category: BlueprintCategory): string {
  return category
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export default function QuizModePage() {
  const router = useRouter();
  const [category, setCategory] = useState<BlueprintCategory>(BLUEPRINT[0].category);
  const [count, setCount] = useState(10);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startQuiz(body: Record<string, unknown>) {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch("/api/quiz/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("Could not start quiz. Try again.");
        return;
      }
      const data = await res.json();
      if (!data.questions || data.questions.length === 0) {
        setError("No questions available for this mode yet.");
        return;
      }
      sessionStorage.setItem(
        "quizSession",
        JSON.stringify({ attemptId: data.attemptId, questions: data.questions, mode: body.mode })
      );
      router.push("/quiz/session");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-6">
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* Home link so the mode screen is never a dead-end. */}
        <Link href="/" className="eyebrow self-start hover:text-pine transition-colors">
          ← Home
        </Link>

        <header className="flex flex-col gap-2">
          <p className="eyebrow">Practice</p>
          <h1 className="text-3xl font-semibold">Choose a mode</h1>
        </header>

        {error && (
          <p className="text-sm text-maroon" role="alert">
            {error}
          </p>
        )}

        <section className="card flex flex-col gap-4 p-5 border-l-2 border-l-pine">
          <div className="flex flex-col gap-1">
            <p className="eyebrow">01 · Mock Exam</p>
            <h2 className="text-lg font-medium">Full mock</h2>
          </div>
          <p className="font-mono text-xs text-ink-soft">150 items · 210 min · 60% to pass</p>
          <button
            type="button"
            disabled={starting}
            onClick={() => startQuiz({ mode: "full" })}
            className="btn btn-primary w-full"
          >
            Start full mock
          </button>
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <p className="eyebrow">02 · Focused</p>
            <h2 className="text-lg font-medium">Topic drill</h2>
          </div>
          <label className="flex flex-col gap-1.5 text-sm text-ink-soft">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BlueprintCategory)}
              className="field text-ink"
            >
              {BLUEPRINT.map(({ category: c }) => (
                <option key={c} value={c}>
                  {formatCategory(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-ink-soft">
            Number of questions
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="field font-mono text-ink"
            />
          </label>
          <button
            type="button"
            disabled={starting || !Number.isFinite(count) || count <= 0}
            onClick={() => startQuiz({ mode: "topic", category, count })}
            className="btn btn-secondary w-full"
          >
            Start topic drill
          </button>
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <p className="eyebrow">03 · Review</p>
            <h2 className="text-lg font-medium">Review mistakes</h2>
          </div>
          <p className="text-sm text-ink-soft">
            Retry every question whose last answer was wrong. Shrinks as you improve.
          </p>
          <button
            type="button"
            disabled={starting}
            onClick={() => startQuiz({ mode: "review" })}
            className="btn btn-secondary w-full"
          >
            Review mistakes
          </button>
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <p className="eyebrow">04 · Review</p>
            <h2 className="text-lg font-medium">Completed questions</h2>
          </div>
          <p className="text-sm text-ink-soft">
            Revisit every question you have answered, right or wrong, with its
            explanation and source.
          </p>
          <button
            type="button"
            disabled={starting}
            onClick={() => startQuiz({ mode: "completed" })}
            className="btn btn-secondary w-full"
          >
            Review completed
          </button>
        </section>
      </div>
    </div>
  );
}
