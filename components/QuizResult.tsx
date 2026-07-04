import Link from "next/link";

export interface QuizResultProps {
  correct: number;
  total: number;
  percentage: number;
  passed: boolean;
}

export default function QuizResult({ correct, total, percentage, passed }: QuizResultProps) {
  // Full literal class strings so Tailwind's JIT can see them (dynamic
  // `border-${x}` names are never generated).
  const gauge = passed ? "border-pine bg-pine-tint" : "border-maroon bg-maroon-tint";
  const accentText = passed ? "text-pine" : "text-maroon";
  return (
    <div className="flex flex-col items-center gap-7 w-full max-w-md mx-auto p-8 text-center">
      <p className="eyebrow">Result</p>

      {/* Clinical gauge: the score as an instrument readout. */}
      <div className={`grid place-items-center h-40 w-40 rounded-full border-4 ${gauge}`}>
        <span className={`font-mono text-4xl font-medium ${accentText}`}>{percentage}%</span>
      </div>

      <div className="flex flex-col gap-1">
        <p className={`text-2xl font-semibold ${accentText}`}>{passed ? "Pass" : "Below pass"}</p>
        <p className="font-mono text-xs text-ink-soft">
          {correct} / {total} correct · 60% to pass
        </p>
      </div>

      <Link href="/quiz" className="btn btn-primary w-full">
        Back to modes
      </Link>
    </div>
  );
}
