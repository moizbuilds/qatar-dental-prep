import { NextRequest, NextResponse } from "next/server";
import { attemptExists, getChunkById, getQuestionById, recordAnswer } from "../../../../lib/db";

type AnswerBody = {
  attemptId?: number;
  questionId?: number;
  selectedIndex?: number;
};

export async function POST(request: NextRequest) {
  let body: AnswerBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { attemptId, questionId, selectedIndex } = body;

  if (
    typeof attemptId !== "number" ||
    typeof questionId !== "number" ||
    typeof selectedIndex !== "number"
  ) {
    return NextResponse.json(
      { error: "'attemptId', 'questionId', and 'selectedIndex' are required" },
      { status: 400 }
    );
  }

  if (!attemptExists(attemptId)) {
    // Guard the FK before recordAnswer, otherwise a bogus attemptId throws an
    // unhandled 500 instead of a clean 404.
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  const question = getQuestionById(questionId);
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const correct = selectedIndex === question.correct_index;

  recordAnswer({
    attempt_id: attemptId,
    question_id: questionId,
    selected_index: selectedIndex,
    is_correct: correct,
  });

  const chunk = question.source_chunk_id ? getChunkById(question.source_chunk_id) : undefined;
  const citation = chunk ? { book: chunk.book, page_start: chunk.page_start } : null;

  return NextResponse.json({
    correct,
    correctIndex: question.correct_index,
    explanation: question.explanation,
    citation,
  });
}
