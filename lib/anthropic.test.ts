import { describe, it, expect, vi } from "vitest";
import { askGrounded, buildSystemPrompt, ASK_MODEL, type AnthropicLike } from "./anthropic";
import type { Chunk } from "./db/types";

const CHUNKS: Chunk[] = [
  {
    id: "c1",
    book: "Guide to Periodontics",
    page_start: 41,
    page_end: 42,
    category_hint: "periodontics",
    text: "A periodontal probe is used to measure pocket depth around each tooth.",
  },
  {
    id: "c2",
    book: "Paediatric Dentistry",
    page_start: 88,
    page_end: 88,
    category_hint: "pediatric",
    text: "A pulpotomy removes the coronal pulp of a primary tooth.",
  },
];

describe("buildSystemPrompt", () => {
  it("includes the passages and the grounding rules", () => {
    const prompt = buildSystemPrompt(CHUNKS);
    expect(prompt).toContain("Guide to Periodontics, p.41");
    expect(prompt).toContain("periodontal probe is used to measure pocket depth");
    expect(prompt).toContain("cite the book title and page number");
    // Fallback: when the books don't cover it, still answer from general knowledge (clearly marked).
    expect(prompt).toContain("Not covered in your textbooks");
    expect(prompt).toContain("general-knowledge");
  });
});

describe("askGrounded", () => {
  it("calls claude-sonnet-5 with the grounded system prompt and returns only cited sources", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Use a periodontal probe (Guide to Periodontics, p.41)." }],
    });
    const mockClient: AnthropicLike = { messages: { create } };

    const result = await askGrounded("How is pocket depth measured?", CHUNKS, [], mockClient);

    // Model + system prompt assertions
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args.model).toBe(ASK_MODEL);
    expect(args.model).toBe("claude-sonnet-5");
    expect(args.system).toContain("Guide to Periodontics, p.41");
    expect(args.messages[0].content).toBe("How is pocket depth measured?");

    // Honest sources: only the chunk actually cited (p.41) is returned, not the
    // uncited paediatric chunk (p.88).
    expect(result.answer).toContain("periodontal probe");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toEqual({
      chunk_id: "c1",
      book: "Guide to Periodontics",
      page_start: 41,
      page_end: 42,
    });
  });

  it("returns no sources for a not-covered (general-knowledge) answer", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: "⚠️ Not covered in your textbooks — general answer:\nFluoride varnish is applied topically.",
        },
      ],
    });
    const result = await askGrounded("What is fluoride varnish?", CHUNKS, [], {
      messages: { create },
    });
    expect(result.sources).toHaveLength(0);
  });

  it("passes prior turns before the current question for follow-up context", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "In children, the technique differs." }],
    });
    await askGrounded(
      "What about in children?",
      CHUNKS,
      [
        { role: "user", content: "How is a pulpotomy performed?" },
        { role: "assistant", content: "A pulpotomy removes the coronal pulp." },
      ],
      { messages: { create } }
    );
    const args = create.mock.calls[0][0];
    expect(args.messages).toHaveLength(3);
    expect(args.messages[0]).toEqual({ role: "user", content: "How is a pulpotomy performed?" });
    expect(args.messages[2]).toEqual({ role: "user", content: "What about in children?" });
  });
});
