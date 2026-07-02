import Link from "next/link";

export interface QuizResultProps {
  correct: number;
  total: number;
  percentage: number;
  passed: boolean;
}

export default function QuizResult({ correct, total, percentage, passed }: QuizResultProps) {
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto p-8 text-center">
      <h1 className="text-2xl font-bold">Quiz complete</h1>

      <div
        className={`rounded-full h-32 w-32 flex items-center justify-center text-3xl font-bold border-4 ${
          passed
            ? "border-green-600 text-green-700"
            : "border-red-600 text-red-700"
        }`}
      >
        {percentage}%
      </div>

      <p className="text-lg font-semibold">{passed ? "Pass" : "Fail"}</p>
      <p className="text-black/60 dark:text-white/60">
        {correct} of {total} correct (60% required to pass)
      </p>

      <div className="flex flex-col gap-3 w-full">
        <Link
          href="/quiz"
          className="rounded-full border border-solid border-transparent bg-foreground text-background font-medium text-base h-12 px-5 w-full flex items-center justify-center"
        >
          Back to quiz modes
        </Link>
      </div>
    </div>
  );
}
