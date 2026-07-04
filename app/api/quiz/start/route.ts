import { NextRequest, NextResponse } from "next/server";
import {
  createAttempt,
  getQuestionsByCategory,
  missedQuestions,
  completedQuestions,
  randomMock,
} from "../../../../lib/db";
import type { BlueprintCategory, Question, QuizMode } from "../../../../lib/db/types";

/** Client-safe question shape: never leaks correct_index or explanation. */
interface PublicQuestion {
  id: number;
  category: BlueprintCategory;
  stem: string;
  choices: string[];
}

function toPublicQuestion(q: Question): PublicQuestion {
  return { id: q.id, category: q.category, stem: q.stem, choices: q.choices };
}

type StartBody = {
  mode?: QuizMode;
  category?: BlueprintCategory;
  count?: number;
};

export async function POST(request: NextRequest) {
  let body: StartBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { mode } = body;

  let questions: Question[];
  if (mode === "full") {
    questions = await randomMock();
  } else if (mode === "topic") {
    const { category, count } = body;
    // Number.isFinite rejects NaN (an empty count field serializes to NaN,
    // which slips past a bare `count <= 0` check and 500s in the DB layer).
    if (!category || !Number.isFinite(count) || (count as number) <= 0) {
      return NextResponse.json(
        { error: "Topic drill requires 'category' and a positive 'count'" },
        { status: 400 }
      );
    }
    questions = await getQuestionsByCategory(category, count as number);
  } else if (mode === "review") {
    questions = await missedQuestions();
  } else if (mode === "completed") {
    questions = await completedQuestions();
  } else {
    return NextResponse.json(
      { error: "Invalid 'mode'; expected 'full', 'topic', 'review', or 'completed'" },
      { status: 400 }
    );
  }

  // Don't create an attempt for an empty question set (e.g. review with no
  // outstanding mistakes) — that would litter the DB with 0-question orphans.
  if (questions.length === 0) {
    return NextResponse.json({ attemptId: null, questions: [] });
  }

  const attemptId = await createAttempt(mode);

  return NextResponse.json({
    attemptId,
    questions: questions.map(toPublicQuestion),
  });
}
