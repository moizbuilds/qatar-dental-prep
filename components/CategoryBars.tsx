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
            <div className="flex justify-between text-sm mb-1">
              <span>{labelFor(c.category)}</span>
              <span className={attempted ? (passing ? "text-green-600" : "text-red-600") : "text-gray-400"}>
                {attempted ? `${pct}%` : "—"}
              </span>
            </div>
            <div className="relative h-3 w-full rounded bg-gray-200 dark:bg-gray-700">
              {attempted && (
                <div
                  className={`h-3 rounded ${passing ? "bg-green-500" : "bg-red-500"}`}
                  style={{ width: `${pct}%` }}
                />
              )}
              {/* 60% pass line */}
              <div
                className="absolute top-0 h-3 w-px bg-gray-900 dark:bg-white"
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
