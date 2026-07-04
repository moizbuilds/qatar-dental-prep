import Link from "next/link";
import { LogoutButton } from "../components/LogoutButton";

// Home = the cover of the record. An eyebrow locates the exam, a Fraunces
// title carries the identity, and the two primary modes are presented as
// entries in a chart rather than generic buttons.
const ENTRIES = [
  { href: "/quiz", title: "Quiz", desc: "Mock exams, topic drills, and review of your misses" },
  { href: "/ask", title: "Ask", desc: "Textbook-grounded answers with page citations" },
  { href: "/dashboard", title: "Progress", desc: "Score trend and accuracy across the blueprint" },
];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md flex flex-col gap-9">
        <header className="flex flex-col gap-3 text-center">
          <p className="eyebrow">QNGDQE · Study Companion</p>
          <h1 className="text-[2.75rem] leading-[1.05] font-semibold text-pine">
            Qatar Dental Prep
          </h1>
          <p className="text-ink-soft text-sm leading-relaxed text-balance">
            Verified practice questions and textbook-grounded answers for the Qatar
            National General Dental Qualifying Examination.
          </p>
        </header>

        <nav className="flex flex-col gap-3">
          {ENTRIES.map(({ href, title, desc }, i) => (
            <Link
              key={href}
              href={href}
              className="card flex items-center gap-4 p-5 transition-colors hover:border-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              <span className="eyebrow shrink-0 pt-1">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex flex-col flex-1">
                <span className="text-lg font-medium text-ink">{title}</span>
                <span className="text-sm text-ink-soft">{desc}</span>
              </span>
              <span aria-hidden className="text-pine text-xl">
                →
              </span>
            </Link>
          ))}
        </nav>

        <div className="text-center">
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
