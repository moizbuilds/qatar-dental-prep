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
  it("calls claude-sonnet-5 with the grounded system prompt and returns answer + sources", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Use a periodontal probe (Guide to Periodontics, p.41)." }],
    });
    const mockClient: AnthropicLike = { messages: { create } };

    const result = await askGrounded("How is pocket depth measured?", CHUNKS, mockClient);

    // Model + system prompt assertions
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args.model).toBe(ASK_MODEL);
    expect(args.model).toBe("claude-sonnet-5");
    expect(args.system).toContain("Guide to Periodontics, p.41");
    expect(args.messages[0].content).toBe("How is pocket depth measured?");

    // Result shape
    expect(result.answer).toContain("periodontal probe");
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]).toEqual({
      chunk_id: "c1",
      book: "Guide to Periodontics",
      page_start: 41,
      page_end: 42,
    });
  });
});
