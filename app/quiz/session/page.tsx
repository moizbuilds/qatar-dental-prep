"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QuestionCard, { type AnswerResult, type PublicQuestion } from "../../../components/QuestionCard";
import QuizResult from "../../../components/QuizResult";

const FULL_MOCK_SECONDS = 210 * 60; // 3.5 hours
const STORAGE_KEY = "quizSession";

// Shape persisted in sessionStorage. `currentIndex` and `deadline` are added
// by this page after the quiz starts, so they're optional on the initial write
// from the mode picker.
interface QuizSessionState {
  attemptId: number;
  questions: PublicQuestion[];
  // Must list every mode /api/quiz/start can send. "completed" was added later
  // for the "review completed questions" flow; leaving it out silently typed
  // those sessions wrong.
  mode: "full" | "topic" | "review" | "completed";
  currentIndex?: number;
  deadline?: number; // epoch ms — absolute end time for the full mock timer
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
  const [deadline, setDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(false);
  const [loadedFromStorage, setLoadedFromStorage] = useState(false);

  // Restore the session on mount. Wrapping the parse in try/catch means corrupt
  // storage degrades to the "no session" screen instead of white-screening.
  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as QuizSessionState;
        // For the timed mock, pin an absolute deadline once and reuse it across
        // reloads — so refreshing doesn't reset the clock back to 3.5 hours.
        if (parsed.mode === "full") {
          const dl = parsed.deadline ?? Date.now() + FULL_MOCK_SECONDS * 1000;
          parsed.deadline = dl;
          setDeadline(dl);
        }
        setCurrentIndex(parsed.currentIndex ?? 0);
        setSession(parsed);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch {
        // Corrupt payload: treat as no active session.
      }
    }
    setLoadedFromStorage(true);
  }, []);

  // Keep the persisted position in sync so a reload resumes where you were,
  // instead of restarting at question 1 and re-answering (which would
  // double-count answers before the DB upsert dedupes them).
  useEffect(() => {
    if (!session) return;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return; // finished or exited — nothing to sync
    try {
      const parsed = JSON.parse(raw) as QuizSessionState;
      parsed.currentIndex = currentIndex;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      /* ignore */
    }
  }, [currentIndex, session]);

  const finishAttempt = useCallback(async (attemptId: number) => {
    setFinishing(true);
    setFinishError(false);
    try {
      const res = await fetch("/api/quiz/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
      if (!res.ok) throw new Error("finish failed");
      const data = (await res.json()) as FinishResult;
      setResult(data);
      setFinished(true);
      // Only discard the session AFTER a successful finish — otherwise a failed
      // request would throw away the only copy of a completed attempt.
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      setFinishError(true);
    } finally {
      setFinishing(false);
    }
  }, []);

  // Countdown timer for full mock mode. Recomputed from the absolute deadline
  // on every tick, so it stays correct across reloads and background-tab
  // throttling, and auto-finishes when time runs out.
  useEffect(() => {
    if (deadline === null || finished || !session) return;
    function tick() {
      const remaining = Math.ceil((deadline! - Date.now()) / 1000);
      if (remaining <= 0) {
        setSecondsLeft(0);
        finishAttempt(session!.attemptId);
      } else {
        setSecondsLeft(remaining);
      }
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline, finished, session, finishAttempt]);

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

  // Finish request failed: keep the session intact and let the user retry
  // rather than showing an "undefined%" result and losing the attempt.
  if (finishError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p>Couldn&apos;t submit your quiz. Your answers are safe — try again.</p>
        <button
          type="button"
          onClick={() => finishAttempt(session.attemptId)}
          disabled={finishing}
          className="rounded-full border border-solid border-transparent bg-foreground text-background font-medium text-base h-12 px-5 disabled:opacity-50"
        >
          {finishing ? "Submitting..." : "Retry"}
        </button>
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
    // Throw on failure so QuestionCard shows a retry instead of rendering an
    // undefined result as a false "Incorrect".
    if (!res.ok) throw new Error("answer submission failed");
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
    sessionStorage.removeItem(STORAGE_KEY);
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
            role="timer"
            aria-live="off"
            className={`text-sm font-mono rounded-full px-3 py-1 border ${
              secondsLeft < 300
                ? "border-red-600 text-red-700"
                : "border-black/[.08] dark:border-white/[.145]"
            }`}
          >
            {secondsLeft < 300 ? "⏱ " : ""}
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
