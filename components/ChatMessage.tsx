// Renders a single chat bubble in Ask mode.
//
// User messages are shown as plain text (it's their own literal input).
// Assistant answers are rendered as Markdown so Claude can return tables,
// lists, headings, bold terms, and code — anything a study answer needs.
//
// SECURITY: react-markdown does NOT render raw HTML unless you add the
// rehype-raw plugin, which we deliberately don't. So even though the answer
// text comes from an LLM, there's no HTML/script injection surface here.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // CONCEPT: GFM = GitHub-Flavored Markdown — adds tables, strikethrough, task lists on top of plain Markdown.

export interface SourceRef {
  chunk_id: string;
  book: string;
  page_start: number;
  page_end: number;
}

export function ChatMessage({
  role,
  content,
  sources,
}: {
  role: "user" | "assistant";
  content: string;
  sources?: SourceRef[];
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
          isUser
            ? "whitespace-pre-wrap bg-pine text-paper"
            : "border border-line bg-surface text-ink"
        }`}
      >
        {isUser ? <p>{content}</p> : <MarkdownAnswer content={content} />}
        {!isUser && sources && sources.length > 0 && (
          <div className="mt-3 border-t border-line pt-2 font-mono text-[0.7rem] text-ink-soft">
            <span className="uppercase tracking-wider">Sources · </span>
            {dedupeSources(sources)
              .map((s) => `${s.book} p.${s.page_start}`)
              .join("  ·  ")}
          </div>
        )}
      </div>
    </div>
  );
}

// Styles Markdown elements with Tailwind. We map each element explicitly
// instead of pulling in the typography plugin — fewer deps, and full control
// over how tables look on a phone (they scroll horizontally instead of
// squashing the layout).
function MarkdownAnswer({ content }: { content: string }) {
  return (
    <div className="space-y-3 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p className="whitespace-pre-wrap" {...props} />,
          strong: (props) => <strong className="font-semibold" {...props} />,
          ul: (props) => <ul className="list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
          li: (props) => <li className="pl-1" {...props} />,
          h1: (props) => <h1 className="text-base font-bold" {...props} />,
          h2: (props) => <h2 className="text-base font-bold" {...props} />,
          h3: (props) => <h3 className="text-sm font-semibold" {...props} />,
          a: (props) => <a className="text-pine underline" {...props} />,
          code: (props) => (
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]" {...props} />
          ),
          pre: (props) => (
            <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs" {...props} />
          ),
          blockquote: (props) => (
            <blockquote className="border-l-2 border-pine pl-3 text-ink-soft" {...props} />
          ),
          // Wrap tables so wide ones scroll horizontally on mobile instead of
          // breaking the chat width.
          table: (props) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" {...props} />
            </div>
          ),
          thead: (props) => <thead className="bg-surface-2" {...props} />,
          th: (props) => (
            <th className="border border-line px-2 py-1 text-left font-semibold" {...props} />
          ),
          td: (props) => <td className="border border-line px-2 py-1 align-top" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function dedupeSources(sources: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const s of sources) {
    const key = `${s.book}:${s.page_start}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}
