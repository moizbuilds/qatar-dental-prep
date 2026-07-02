import { NextResponse } from "next/server";
import { attemptStats, attemptHistory } from "../../../lib/db";
import { BLUEPRINT } from "../../../lib/db/types";

const PASS_THRESHOLD_PERCENT = 60;

/**
 * Dashboard data: per-category accuracy for every blueprint category (filled
 * with zeros where nothing has been attempted yet) and the per-attempt score
 * trend. Read-only; auth is enforced by middleware.
 */
export async function GET() {
  const statsByCategory = new Map(attemptStats().map((s) => [s.category, s]));

  const categories = BLUEPRINT.map(({ category, examCount }) => {
    const s = statsByCategory.get(category);
    const attempted = s?.attempted ?? 0;
    const correct = s?.correct ?? 0;
    return {
      category,
      examCount,
      attempted,
      correct,
      accuracyPercent: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
    };
  });

  const weakest = [...categories]
    .filter((c) => c.attempted > 0)
    .sort((a, b) => a.accuracyPercent - b.accuracyPercent)
    .slice(0, 3)
    .map((c) => c.category);

  return NextResponse.json({
    passThreshold: PASS_THRESHOLD_PERCENT,
    categories,
    history: attemptHistory(),
    weakest,
  });
}
