import Anthropic from "@anthropic-ai/sdk";
import type { Chunk } from "./db/types";

/** Model powering Ask mode. Sonnet 5 = near-Opus quality at lower cost. */
export const ASK_MODEL = "claude-sonnet-5";

/** A cited source returned alongside an answer, for display in the UI. */
export interface SourceRef {
  chunk_id: string;
  book: string;
  page_start: number;
  page_end: number;
}

export interface GroundedAnswer {
  answer: string;
  sources: SourceRef[];
}

/** Minimal shape of the Anthropic client we depend on — lets tests inject a mock. */
export interface AnthropicLike {
  messages: {
    create(args: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

/**
 * Builds the system prompt. Claude must answer ONLY from the supplied
 * passages, cite the book + page for each claim, and say plainly when the
 * books don't cover the question — no guessing.
 */
export function buildSystemPrompt(chunks: Chunk[]): string {
  const passages = chunks
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.book}, p.${c.page_start}]\n${c.text}`
    )
    .join("\n\n---\n\n");

  return [
    "You are a study tutor for the Qatar National General Dental Qualifying Examination.",
    "Answer the student's question using ONLY the reference passages below.",
    "Rules:",
    "- Base every statement on the passages. Do not use outside knowledge.",
    "- Cite the book title and page number in parentheses after each claim, e.g. (Guide to Periodontics, p.41).",
    "- If the passages do not contain the answer, say clearly: \"The reference books provided don't cover this.\" Do not guess or invent facts.",
    "- Explain at the level of a candidate preparing for a licensing exam: clear, accurate, and concise.",
    "",
    "Reference passages:",
    "",
    passages || "(no relevant passages were found)",
  ].join("\n");
}

/**
 * Answers a question grounded in the retrieved chunks. Pass a client to
 * inject a mock in tests; defaults to a real Anthropic client (reads
 * ANTHROPIC_API_KEY from the environment).
 */
export async function askGrounded(
  question: string,
  chunks: Chunk[],
  client?: AnthropicLike
): Promise<GroundedAnswer> {
  const anthropic: AnthropicLike = client ?? new Anthropic();

  const message = await anthropic.messages.create({
    model: ASK_MODEL,
    max_tokens: 2000,
    thinking: { type: "disabled" },
    system: buildSystemPrompt(chunks),
    messages: [{ role: "user", content: question }],
  });

  const answer = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  const sources: SourceRef[] = chunks.map((c) => ({
    chunk_id: c.id,
    book: c.book,
    page_start: c.page_start,
    page_end: c.page_end,
  }));

  return { answer, sources };
}
