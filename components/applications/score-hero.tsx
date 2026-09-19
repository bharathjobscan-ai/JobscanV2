import { MATCH_HINTS, MATCH_LABELS, type MatchCategory } from "@/lib/config/constants";

/**
 * The score as the single result on the page (JSV2S1139).
 *
 * The approved design puts one number at the centre and everything else
 * underneath it, because the page exists to answer one question — apply or
 * not — and a grid of equal-weight cards makes the reader find the answer
 * rather than be told it.
 *
 * The verdict is stated in words as well as a number. "54" invites arithmetic;
 * "Do not apply" is a decision, and the band is derived in code from the score
 * so it cannot drift from what the model said.
 */

const VERDICT: Record<MatchCategory, string> = {
  priority_apply: "Strong apply",
  apply: "Apply",
  referral_only: "Only with a referral",
  reject: "Skip it",
  gate_qualified: "Worth applying",
};

export function ScoreHero({
  score,
  matchCategory,
  summary,
  company,
  location,
  title,
}: {
  score: number | null;
  matchCategory: MatchCategory | null;
  /** One line of prose on why it reads this way. */
  summary?: string | null;
  company: string;
  location: string | null;
  title: string;
}) {
  const tone =
    matchCategory === "priority_apply"
      ? "text-positive"
      : matchCategory === "reject"
        ? "text-negative"
        : matchCategory === "referral_only"
          ? "text-warning"
          : "";

  return (
    <section className="py-8 text-center">
      <p className="text-[11px] tracking-[0.18em] text-faint uppercase">
        {company}
        {location ? ` · ${location}` : ""}
      </p>
      <h1 className="mt-3 text-3xl font-normal tracking-tight">{title}</h1>

      {score === null && matchCategory === "gate_qualified" ? (
        /*
         * Deliberately not a number (JSV2S1168). The page's job is to answer
         * "apply or not", and here that is already answered — by five
         * deterministic filters and a company known to sponsor. A score would
         * add a digit, not an answer.
         */
        <div className="mt-8">
          <p className="text-[2rem] leading-tight font-semibold tracking-tight">
            Worth applying
          </p>
          <p className="mx-auto mt-3 max-w-[38ch] text-sm text-muted">
            Every filter passed and this company is a known sponsor, so no
            scoring call was made.
          </p>
          <p className="mt-2 text-xs text-faint">
            Generate score below if you want one anyway.
          </p>
        </div>
      ) : score === null ? (
        <p className="mt-8 text-sm text-muted">
          Not scored yet. Scoring weighs sponsorship likelihood, domain
          relevance and experience fit.
        </p>
      ) : (
        <>
          {/* Deliberately oversized. This is the page's whole point. */}
          <p
            className={`mt-8 text-[7rem] leading-[0.84] font-normal tracking-tighter tabular-nums ${tone}`}
          >
            {score}
          </p>
          <p className="mt-6 text-xs text-faint tabular-nums">
            of 100
            {matchCategory ? ` · ${MATCH_HINTS[matchCategory]}` : ""}
          </p>
          {matchCategory ? (
            <p className="mt-5 text-[2rem] font-semibold tracking-tight">
              {VERDICT[matchCategory]}
            </p>
          ) : null}
        </>
      )}

      {summary ? (
        <p className="mx-auto mt-4 max-w-[34ch] text-lg leading-snug font-normal text-muted">
          {summary}
        </p>
      ) : null}
    </section>
  );
}

export type Figure = {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "warning" | "negative";
};

/**
 * The four figures, calm and evenly weighted.
 *
 * Deliberately not cards: hairlines between columns rather than boxes, so they
 * read as one row of facts underneath the score rather than four competing
 * claims beside it.
 */
export function FigureRow({ figures }: { figures: Figure[] }) {
  return (
    <div className="grid grid-cols-2 border-y border-line sm:grid-cols-4">
      {figures.map((f, i) => (
        <div
          key={f.label}
          className={`px-4 py-5 ${i > 0 ? "sm:border-l sm:border-line" : ""} ${
            i % 2 === 1 ? "border-l border-line sm:border-l" : ""
          }`}
        >
          <p className="text-[10px] tracking-wider text-faint uppercase">{f.label}</p>
          <p
            className={`mt-2 text-lg font-semibold ${
              f.tone === "negative"
                ? "text-negative"
                : f.tone === "warning"
                  ? "text-warning"
                  : f.tone === "positive"
                    ? "text-positive"
                    : ""
            }`}
          >
            {f.value}
          </p>
          {f.hint ? (
            <p className="text-[11px] text-faint tabular-nums">{f.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Why it reads this way — what holds, and what fails.
 *
 * Two columns rather than one list, because "strong domain match" and "no visa
 * evidence" are not the same kind of fact and reading them interleaved makes
 * neither land.
 */
export function Basis({
  holding,
  failing,
}: {
  holding: string[];
  failing: string[];
}) {
  if (holding.length === 0 && failing.length === 0) return null;

  return (
    <section className="pt-12">
      <p className="mb-5 text-[11px] tracking-wider text-faint uppercase">
        Why it reads this way
      </p>
      <div className="grid gap-8 sm:grid-cols-2">
        {holding.length > 0 ? (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-positive">Holding</h3>
            <ul className="flex flex-col gap-3 text-sm">
              {holding.map((item, i) => (
                <li key={i} className="border-l border-positive/40 pl-3.5">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {failing.length > 0 ? (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-negative">Failing</h3>
            <ul className="flex flex-col gap-3 text-sm">
              {failing.map((item, i) => (
                <li key={i} className="border-l border-negative/40 pl-3.5">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Low-frequency detail, behind a disclosure. Read once, then in the way. */
export function OnNeed({
  title,
  meta,
  children,
  open,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  /**
   * Start expanded. For a section that is the page's answer rather than its
   * footnote — a gate-qualified application has no score, so the gate's working
   * IS the result and hiding it behind a click would hide the whole verdict.
   */
  open?: boolean;
}) {
  return (
    <details open={open} className="border-t border-line">
      <summary className="flex cursor-pointer items-center gap-3 py-4 text-sm font-semibold hover:text-foreground">
        <span className="text-accent">+</span>
        {title}
        {meta ? (
          <span className="ml-auto text-[11px] font-normal text-faint">{meta}</span>
        ) : null}
      </summary>
      <div className="pb-5 pl-6">{children}</div>
    </details>
  );
}

export { MATCH_LABELS };
