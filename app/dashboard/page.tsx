import Link from "next/link";
import { attemptStats, attemptHistory } from "../../lib/db";
import { BLUEPRINT, CATEGORY_LABELS } from "../../lib/db/types";
import { CategoryBars } from "../../components/CategoryBars";

const PASS_THRESHOLD = 60;

// Reads the local SQLite DB per request; never statically prerendered.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const statsByCategory = new Map((await attemptStats()).map((s) => [s.category, s]));
  const categories = BLUEPRINT.map(({ category }) => {
    const s = statsByCategory.get(category);
    const attempted = s?.attempted ?? 0;
    const correct = s?.correct ?? 0;
    return {
      category,
      attempted,
      accuracyPercent: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
    };
  });

  const history = await attemptHistory();
  const weakest = [...categories]
    .filter((c) => c.attempted > 0)
    .sort((a, b) => a.accuracyPercent - b.accuracyPercent)
    .slice(0, 3);

  const latest = history[history.length - 1];

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/" className="eyebrow hover:text-pine transition-colors">
        ← Home
      </Link>
      <div className="mt-4 flex items-end justify-between mb-8">
        <div className="flex flex-col gap-1">
          <p className="eyebrow">Progress</p>
          <h1 className="text-3xl font-semibold">Your record</h1>
        </div>
        <Link href="/quiz" className="text-sm font-medium text-pine hover:underline">
          Take a quiz →
        </Link>
      </div>

      {history.length === 0 ? (
        <div className="card p-6 text-center text-ink-soft">
          No attempts yet. Take a quiz and your scores will appear here.
        </div>
      ) : (
        <>
          <section className="mb-10">
            <h2 className="text-lg font-medium mb-1">Score trend</h2>
            <p className="text-sm text-ink-soft mb-4">
              {history.length} attempt{history.length === 1 ? "" : "s"}. Latest{" "}
              <span
                className={`font-mono ${latest.pct >= PASS_THRESHOLD ? "text-pine" : "text-maroon"}`}
              >
                {latest.pct}%
              </span>{" "}
              · pass line {PASS_THRESHOLD}%.
            </p>
            <div className="relative flex items-end gap-1.5 h-32 border-b border-line">
              {/* Pass-line marker across the chart. */}
              <div
                aria-hidden
                className="absolute inset-x-0 border-t border-dashed border-ink-soft/40"
                style={{ bottom: `${PASS_THRESHOLD}%` }}
              />
              {history.map((h) => (
                <div
                  key={h.attempt_id}
                  className={`flex-1 min-w-[6px] rounded-t ${
                    h.pct >= PASS_THRESHOLD ? "bg-pine" : "bg-maroon"
                  }`}
                  style={{ height: `${h.pct}%` }}
                  title={`Attempt ${h.attempt_id}: ${h.pct}% (${h.correct}/${h.total})`}
                />
              ))}
            </div>
          </section>

          {weakest.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-medium mb-3">Weakest areas</h2>
              <ol className="flex flex-col gap-2">
                {weakest.map((w, i) => (
                  <li key={w.category} className="flex items-center gap-3 text-sm">
                    <span className="eyebrow">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1">{CATEGORY_LABELS[w.category] ?? w.category}</span>
                    <span
                      className={`font-mono ${
                        w.accuracyPercent >= PASS_THRESHOLD ? "text-pine" : "text-maroon"
                      }`}
                    >
                      {w.accuracyPercent}%
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <h2 className="text-lg font-medium mb-1">Accuracy by category</h2>
            <p className="text-sm text-ink-soft mb-4">
              Bars show your accuracy; the dashed line marks the {PASS_THRESHOLD}% pass threshold.
            </p>
            <CategoryBars categories={categories} passThreshold={PASS_THRESHOLD} />
          </section>
        </>
      )}
    </main>
  );
}
