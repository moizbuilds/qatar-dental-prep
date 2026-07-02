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
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        }`}
      >
        <p>{content}</p>
        {!isUser && sources && sources.length > 0 && (
          <div className="mt-2 border-t border-gray-300 dark:border-gray-600 pt-2 text-xs text-gray-500">
            <span className="font-medium">Sources: </span>
            {dedupeSources(sources)
              .map((s) => `${s.book} p.${s.page_start}`)
              .join(" · ")}
          </div>
        )}
      </div>
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
