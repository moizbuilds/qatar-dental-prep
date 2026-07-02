import Link from "next/link";
import { attemptStats, attemptHistory } from "../../lib/db";
import { BLUEPRINT } from "../../lib/db/types";
import { CategoryBars } from "../../components/CategoryBars";

const PASS_THRESHOLD = 60;

// Reads the local SQLite DB per request; never statically prerendered.
export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  scientific_knowledge: "Scientific Knowledge",
  patient_assessment: "Patient Assessment & Diagnosis",
  treatment_planning: "Treatment Planning",
  health_safety: "Health & Safety",
  emergencies: "Management of Emergencies",
  prevention_population: "Prevention & Population Health",
  pain_anxiety: "Pain & Anxiety Control",
  periodontics: "Periodontics",
  pediatric: "Pediatric Dentistry",
  orthodontics: "Orthodontics",
  restorative_endodontics: "Restorative & Endodontics",
  prosthodontics: "Prosthodontics",
  oral_surgery_medicine: "Oral Surgery & Medicine",
  affective_skills: "Affective Skills",
};

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Your progress</h1>
        <Link href="/quiz" className="text-sm underline">
          Take a quiz →
        </Link>
      </div>

      {history.length === 0 ? (
        <p className="text-gray-500">
          No attempts yet. Take a quiz and your scores will appear here.
        </p>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-2">Score trend</h2>
            <p className="text-sm text-gray-500 mb-3">
              {history.length} attempt{history.length === 1 ? "" : "s"}. Latest:{" "}
              <span className={latest.pct >= PASS_THRESHOLD ? "text-green-600" : "text-red-600"}>
                {latest.pct}%
              </span>{" "}
              (pass line {PASS_THRESHOLD}%).
            </p>
            <div className="flex items-end gap-1 h-32 border-b border-gray-300">
              {history.map((h) => (
                <div
                  key={h.attempt_id}
                  className="flex-1 min-w-[6px] bg-blue-500 rounded-t"
                  style={{ height: `${h.pct}%` }}
                  title={`Attempt ${h.attempt_id}: ${h.pct}% (${h.correct}/${h.total})`}
                />
              ))}
            </div>
          </section>

          {weakest.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-2">Weakest areas</h2>
              <ol className="list-decimal list-inside text-sm">
                {weakest.map((w) => (
                  <li key={w.category}>
                    {LABELS[w.category] ?? w.category} — {w.accuracyPercent}%
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold mb-3">Accuracy by category</h2>
            <p className="text-sm text-gray-500 mb-3">
              Bars show your accuracy; the vertical line marks the {PASS_THRESHOLD}% pass threshold.
            </p>
            <CategoryBars categories={categories} passThreshold={PASS_THRESHOLD} />
          </section>
        </>
      )}
    </main>
  );
}
