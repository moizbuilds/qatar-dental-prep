interface CategoryRow {
  category: string;
  attempted: number;
  accuracyPercent: number;
}

/** Human-readable labels for the 14 blueprint categories. */
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
              <span>{LABELS[c.category] ?? c.category}</span>
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
