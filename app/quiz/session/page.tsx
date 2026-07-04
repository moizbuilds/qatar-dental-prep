"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QuestionCard, { type AnswerResult, type PublicQuestion } from "../../../components/QuestionCard";
import QuizResult from "../../../components/QuizResult";

const FULL_MOCK_SECONDS = 210 * 60; // 3.5 hours

interface QuizSessionState {
  attemptId: number;
  questions: PublicQuestion[];
  // Must list every mode /api/quiz/start can send. "completed" was added later
  // for the "review completed questions" flow; leaving it out silently typed
  // those sessions wrong.
  mode: "full" | "topic" | "review" | "completed";
}

interface FinishResult {
  correct: number;
  total: number;
  percentage: number;
  passed: boolean;
}

function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function QuizSessionPage() {
  const router = useRouter();
  const [session, setSession] = useState<QuizSessionState | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [loadedFromStorage, setLoadedFromStorage] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("quizSession");
    if (raw) {
      const parsed = JSON.parse(raw) as QuizSessionState;
      setSession(parsed);
      if (parsed.mode === "full") {
        setSecondsLeft(FULL_MOCK_SECONDS);
      }
    }
    setLoadedFromStorage(true);
  }, []);

  const finishAttempt = useMemo(
    () => async (attemptId: number) => {
      const res = await fetch("/api/quiz/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
      const data = (await res.json()) as FinishResult;
      setResult(data);
      setFinished(true);
      sessionStorage.removeItem("quizSession");
    },
    []
  );

  // Countdown timer for full mock mode. Auto-finishes when time runs out.
  useEffect(() => {
    if (secondsLeft === null || finished || !session) return;
    if (secondsLeft <= 0) {
      finishAttempt(session.attemptId);
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => (s !== null ? s - 1 : s)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, finished, session, finishAttempt]);

  if (!loadedFromStorage) {
    return null;
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p>No active quiz session found.</p>
        <button
          type="button"
          onClick={() => router.push("/quiz")}
          className="rounded-full border border-solid border-transparent bg-foreground text-background font-medium text-base h-12 px-5"
        >
          Choose a quiz mode
        </button>
      </div>
    );
  }

  if (finished && result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <QuizResult {...result} />
      </div>
    );
  }

  const currentQuestion = session.questions[currentIndex];

  async function handleSubmit(selectedIndex: number): Promise<AnswerResult> {
    const res = await fetch("/api/quiz/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: session!.attemptId,
        questionId: currentQuestion.id,
        selectedIndex,
      }),
    });
    return (await res.json()) as AnswerResult;
  }

  function handleNext() {
    if (currentIndex + 1 < session!.questions.length) {
      setCurrentIndex((i) => i + 1);
    } else {
      finishAttempt(session!.attemptId);
    }
  }

  // Leaving mid-quiz abandons the attempt. For the timed full mock we confirm
  // first (you lose the run); review/completed/topic drills are low-stakes, so
  // we just navigate straight back to the mode picker.
  function handleExit() {
    const isTimed = session!.mode === "full";
    if (isTimed && !window.confirm("Leave the mock exam? Your progress on this attempt will be lost.")) {
      return;
    }
    sessionStorage.removeItem("quizSession");
    router.push("/quiz");
  }

  return (
    <div className="min-h-screen flex flex-col gap-6 p-4">
      <div className="w-full max-w-xl mx-auto flex items-center justify-between">
        <button
          type="button"
          onClick={handleExit}
          className="text-sm text-black/60 dark:text-white/60 hover:underline"
        >
          ← Exit
        </button>
        {secondsLeft !== null && (
          <span
            className={`text-sm font-mono rounded-full px-3 py-1 border ${
              secondsLeft < 300
                ? "border-red-600 text-red-700"
                : "border-black/[.08] dark:border-white/[.145]"
            }`}
          >
            {formatTime(secondsLeft)}
          </span>
        )}
      </div>
      <QuestionCard
        key={currentQuestion.id}
        question={currentQuestion}
        questionNumber={currentIndex + 1}
        totalQuestions={session.questions.length}
        onSubmit={handleSubmit}
        onNext={handleNext}
      />
    </div>
  );
}
