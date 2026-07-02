"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    <div className="min-h-screen flex flex-col items-center gap-10 p-8">
      <h1 className="text-2xl font-bold text-center">Choose a quiz mode</h1>

      {error && (
        <p className="text-sm text-red-600 text-center" role="alert">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3 w-full max-w-sm rounded-xl border border-black/[.08] dark:border-white/[.145] p-5">
        <h2 className="text-lg font-semibold">Full mock exam</h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          150 blueprint-weighted questions, 210-minute timer, 60% to pass.
        </p>
        <button
          type="button"
          disabled={starting}
          onClick={() => startQuiz({ mode: "full" })}
          className="rounded-full border border-solid border-transparent bg-foreground text-background font-medium text-base h-12 px-5 w-full disabled:opacity-50"
        >
          Start full mock
        </button>
      </section>

      <section className="flex flex-col gap-3 w-full max-w-sm rounded-xl border border-black/[.08] dark:border-white/[.145] p-5">
        <h2 className="text-lg font-semibold">Topic drill</h2>
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as BlueprintCategory)}
            className="rounded-lg border border-black/[.08] dark:border-white/[.145] px-3 h-10 bg-transparent"
          >
            {BLUEPRINT.map(({ category: c }) => (
              <option key={c} value={c}>
                {formatCategory(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Number of questions
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="rounded-lg border border-black/[.08] dark:border-white/[.145] px-3 h-10 bg-transparent"
          />
        </label>
        <button
          type="button"
          disabled={starting || count <= 0}
          onClick={() => startQuiz({ mode: "topic", category, count })}
          className="rounded-full border border-solid border-transparent bg-foreground text-background font-medium text-base h-12 px-5 w-full disabled:opacity-50"
        >
          Start topic drill
        </button>
      </section>

      <section className="flex flex-col gap-3 w-full max-w-sm rounded-xl border border-black/[.08] dark:border-white/[.145] p-5">
        <h2 className="text-lg font-semibold">Review mistakes</h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          Retry every question you have answered incorrectly so far.
        </p>
        <button
          type="button"
          disabled={starting}
          onClick={() => startQuiz({ mode: "review" })}
          className="rounded-full border border-solid border-transparent bg-foreground text-background font-medium text-base h-12 px-5 w-full disabled:opacity-50"
        >
          Review mistakes
        </button>
      </section>

      <section className="flex flex-col gap-3 w-full max-w-sm rounded-xl border border-black/[.08] dark:border-white/[.145] p-5">
        <h2 className="text-lg font-semibold">Review completed questions</h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          Revisit every question you have already answered, right or wrong,
          with its explanation and source.
        </p>
        <button
          type="button"
          disabled={starting}
          onClick={() => startQuiz({ mode: "completed" })}
          className="rounded-full border border-solid border-transparent bg-foreground text-background font-medium text-base h-12 px-5 w-full disabled:opacity-50"
        >
          Review completed questions
        </button>
      </section>
    </div>
  );
}
