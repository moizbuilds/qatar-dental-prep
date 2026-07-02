"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ChatMessage, type SourceRef } from "../../components/ChatMessage";

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: SourceRef[];
}

/** Stable per-browser session id so history persists across reloads. */
function getSessionId(): string {
  const KEY = "ask-session-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export default function AskPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const sessionRef = useRef<string>("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionRef.current = getSessionId();
    fetch(`/api/ask?session=${sessionRef.current}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.messages)) {
          setMessages(d.messages.map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content })));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(question: string) {
    setError(null);
    setLastQuestion(question);
    setMessages((m) => [...m, { role: "user", content: question }]);
    setLoading(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, session: sessionRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.answer, sources: data.sources }]);
      }
    } catch {
      setError("Network error. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    void send(q);
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Ask the books</h1>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.length === 0 && !loading && (
          <p className="text-sm text-gray-500">
            Ask any dental question. Answers are grounded in your textbooks with citations.
          </p>
        )}
        {messages.map((m, i) => (
          <ChatMessage key={i} role={m.role} content={m.content} sources={m.sources} />
        ))}
        {loading && <p className="text-sm text-gray-400">Thinking…</p>}
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <p>{error}</p>
            {lastQuestion && (
              <button
                onClick={() => void send(lastQuestion)}
                className="mt-1 underline"
                disabled={loading}
              >
                Retry
              </button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 pt-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. How is a pulpotomy performed?"
          className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm dark:bg-gray-900"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
