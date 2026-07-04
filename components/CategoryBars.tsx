import { CATEGORY_LABELS, type BlueprintCategory } from "../lib/db/types";

interface CategoryRow {
  category: string;
  attempted: number;
  accuracyPercent: number;
}

function labelFor(category: string): string {
  return CATEGORY_LABELS[category as BlueprintCategory] ?? category;
}

export function CategoryBars({
  categories,
  passThreshold,
}: {
  categories: CategoryRow[];
  passThreshold: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      {categories.map((c) => {
        const attempted = c.attempted > 0;
        const pct = c.accuracyPercent;
        const passing = pct >= passThreshold;
        return (
          <div key={c.category}>
            <div className="flex justify-between text-sm mb-1.5">
              <span>{labelFor(c.category)}</span>
              <span
                className={`font-mono text-xs ${
                  attempted ? (passing ? "text-pine" : "text-maroon") : "text-ink-soft"
                }`}
              >
                {attempted ? `${pct}%` : "—"}
              </span>
            </div>
            <div className="relative h-2.5 w-full rounded bg-surface-2">
              {attempted && (
                <div
                  className={`h-2.5 rounded ${passing ? "bg-pine" : "bg-maroon"}`}
                  style={{ width: `${pct}%` }}
                />
              )}
              {/* 60% pass line */}
              <div
                className="absolute top-0 h-2.5 w-px bg-ink/50"
                style={{ left: `${passThreshold}%` }}
                aria-hidden
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
