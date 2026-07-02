import { NextRequest, NextResponse } from "next/server";
import {
  createAttempt,
  getQuestionsByCategory,
  missedQuestions,
  randomMock,
} from "../../../../lib/db";
import type { BlueprintCategory, Question } from "../../../../lib/db/types";

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
  mode?: "full" | "topic" | "review";
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
    questions = randomMock();
  } else if (mode === "topic") {
    const { category, count } = body;
    if (!category || typeof count !== "number" || count <= 0) {
      return NextResponse.json(
        { error: "Topic drill requires 'category' and a positive 'count'" },
        { status: 400 }
      );
    }
    questions = getQuestionsByCategory(category, count);
  } else if (mode === "review") {
    questions = missedQuestions();
  } else {
    return NextResponse.json(
      { error: "Invalid 'mode'; expected 'full', 'topic', or 'review'" },
      { status: 400 }
    );
  }

  const attemptId = createAttempt();

  return NextResponse.json({
    attemptId,
    questions: questions.map(toPublicQuestion),
  });
}
