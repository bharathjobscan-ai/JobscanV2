import type { ReactNode } from "react";

import { MATCH_HINTS, MATCH_LABELS, type MatchCategory } from "@/lib/config/constants";

/**
 * The score as the single result on the page (JSV2S1139, restyled JSV2S1172).
 *
 * Nocturnal puts the posting on the left and the number on the right of one
 * masthead, rather than centring both. The reading order is then the one the
 * decision is made in — what the job is, then what it scored — and the number
 * keeps its own column instead of pushing the title down the page.
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

/** "70-84 · Apply and seek a referral" → "70-84". The pill wants the band. */
function band(category: MatchCategory): string {
  return MATCH_HINTS[category].split(" · ")[0];
}

export function ScoreHero({
  score,
  matchCategory,
  summary,
  company,
  location,
  title,
  meta,
  actions,
}: {
  score: number | null;
  matchCategory: MatchCategory | null;
  /** One line of prose on why it reads this way. */
  summary?: string | null;
  company: string;
  location: string | null;
  title: string;
  /** Status, match and referral badges, above the title. */
  meta?: ReactNode;
  /** The generate buttons, under the posting's facts. */
  actions?: ReactNode;
}) {
  const tone =
    matchCategory === "priority_apply"
      ? "var(--emerald)"
      : matchCategory === "reject"
        ? "var(--negative)"
        : matchCategory === "referral_only"
          ? "var(--warning)"
          : "var(--gold)";

  return (
    <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pt-2 pb-8">
      <div className="min-w-0 flex-1 basis-[22rem]">
        {meta ? <div className="mb-3 flex flex-wrap items-center gap-1.5">{meta}</div> : null}

        <h1 className="n-display text-[clamp(2rem,4vw,2.875rem)] leading-[1.05] font-normal tracking-[-0.02em]">
          {title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-muted">
          <span>{company}</span>
          {location ? <span className="text-faint">{location}</span> : null}
        </div>

        {summary ? (
          <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-muted">{summary}</p>
        ) : null}

        {actions ? <div className="mt-6 flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      <div className="flex-none basis-full text-left sm:basis-auto sm:text-right">
        {score === null && matchCategory === "gate_qualified" ? (
          /*
           * Deliberately not a number (JSV2S1168). The page's job is to answer
           * "apply or not", and here that is already answered — by five
           * deterministic filters and a company known to sponsor. A score would
           * add a digit, not an answer.
           */
          <>
            <p className="text-[10px] tracking-[0.16em] text-faint uppercase">Verdict</p>
            <p
              className="n-display mt-2 text-[34px] leading-none font-semibold"
              style={{ color: "var(--gold)" }}
            >
              Worth applying
            </p>
            <p className="mt-3 max-w-[34ch] text-[12.5px] text-muted sm:ml-auto">
              Every filter passed and this company is a known sponsor, so no
              scoring call was made.
            </p>
            <p className="mt-1 text-[11.5px] text-faint">
              Generate a score if you want one anyway.
            </p>
          </>
        ) : score === null ? (
          <>
            <p className="text-[10px] tracking-[0.16em] text-faint uppercase">Job score</p>
            <p className="n-display mt-2 text-[34px] leading-none text-faint">Not scored</p>
            <p className="mt-3 max-w-[34ch] text-[12.5px] text-muted sm:ml-auto">
              Scoring weighs sponsorship likelihood, domain relevance and
              experience fit.
            </p>
          </>
        ) : (
          <>
            <p className="text-[10px] tracking-[0.16em] text-faint uppercase">Job score</p>
            <div className="mt-1 flex items-baseline gap-2 sm:justify-end">
              {/* Deliberately oversized. This is the page's whole point. */}
              <span
                className="n-display text-[86px] leading-none font-normal tracking-[-0.03em] tabular-nums"
                style={{ color: tone }}
              >
                {score}
              </span>
              <span className="text-[13px] text-faint">of 100</span>
            </div>
            {matchCategory ? (
              <span
                className="mt-2.5 inline-block rounded-full border px-3 py-1 text-[11.5px] whitespace-nowrap"
                style={{
                  color: tone,
                  borderColor: `color-mix(in srgb, ${tone} 50%, transparent)`,
                }}
              >
                {VERDICT[matchCategory]} · {band(matchCategory)}
              </span>
            ) : null}
          </>
        )}
      </div>
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
    <div className="grid grid-cols-1 border-y border-line sm:grid-cols-2 lg:grid-cols-4">
      {figures.map((f, i) => (
        <div
          key={f.label}
          className={`px-4 py-5 first:pl-0 ${
            i % 2 === 1 ? "sm:border-l sm:border-line" : ""
          } ${i > 0 ? "lg:border-l lg:border-line" : ""} ${
            i >= 2 ? "border-t border-line sm:border-t lg:border-t-0" : ""
          }`}
        >
          <p className="text-[10px] tracking-[0.14em] text-faint uppercase">{f.label}</p>
          <p
            className={`n-display mt-1.5 text-[21px] leading-tight font-semibold ${
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
            <p className="n-mono mt-0.5 text-[11.5px] text-faint">{f.hint}</p>
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
    <div className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
      {holding.length > 0 ? (
        <div>
          <p className="border-b border-line pb-2 text-[10px] tracking-[0.14em] text-positive uppercase">
            What carries this application
          </p>
          {holding.map((item, i) => (
            <p
              key={i}
              className="border-b py-3 text-[13.5px] text-muted"
              style={{ borderColor: "var(--hair)" }}
            >
              {item}
            </p>
          ))}
        </div>
      ) : null}

      {failing.length > 0 ? (
        <div>
          <p className="border-b border-line pb-2 text-[10px] tracking-[0.14em] text-warning uppercase">
            What holds it back
          </p>
          {failing.map((item, i) => (
            <p
              key={i}
              className="border-b py-3 text-[13.5px] text-muted"
              style={{ borderColor: "var(--hair)" }}
            >
              {item}
            </p>
          ))}
        </div>
      ) : null}
    </div>
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
  meta?: ReactNode;
  children: ReactNode;
  /**
   * Start expanded. For a section that is the page's answer rather than its
   * footnote — a gate-qualified application has no score, so the gate's working
   * IS the result and hiding it behind a click would hide the whole verdict.
   */
  open?: boolean;
}) {
  return (
    <details open={open} className="group border-t" style={{ borderColor: "var(--hair)" }}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px]">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="text-[11px] text-faint transition-transform group-open:rotate-90">
            ▸
          </span>
          <span className="truncate">{title}</span>
        </span>
        {meta ? (
          <span className="shrink-0 text-[12px] whitespace-nowrap text-faint">{meta}</span>
        ) : null}
      </summary>
      <div className="pb-6 pl-6">{children}</div>
    </details>
  );
}

export { MATCH_LABELS };
