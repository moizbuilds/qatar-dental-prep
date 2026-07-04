"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
        return;
      }

      if (res.status === 429) {
        setError("Too many attempts. Try again later.");
      } else {
        setError("Incorrect passcode.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6">
      <header className="flex flex-col gap-2 text-center">
        <p className="eyebrow">QNGDQE · Study Companion</p>
        <h1 className="text-3xl font-semibold text-pine">Qatar Dental Prep</h1>
      </header>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-xs">
        <input
          type="password"
          name="passcode"
          aria-label="Passcode"
          inputMode="text"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="Enter passcode"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="field w-full text-center tracking-widest"
        />
        <button
          type="submit"
          disabled={submitting || passcode.length === 0}
          className="btn btn-primary w-full"
        >
          {submitting ? "Checking…" : "Enter"}
        </button>
        {error && (
          <p className="text-sm text-maroon text-center" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
