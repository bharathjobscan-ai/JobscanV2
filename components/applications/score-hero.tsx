import type { ReactNode } from "react";

import { MATCH_HINTS, type MatchCategory } from "@/lib/config/constants";

/**
 * The masthead: the posting on the left, the score on the right (JSV2S1139,
 * restyled JSV2S1172, brought to the design 2026-09-23).
 *
 * The reading order is the one the decision is made in — what the job is, then
 * what it scored — and the number keeps its own column instead of pushing the
 * title down the page.
 *
 * The verdict is stated in words as well as a number. "54" invites arithmetic;
 * "Do not apply" is a decision, and the band is derived in code from the score
 * so it cannot drift from what the model said.
 *
 * Everything below the masthead — the verdict sentence, the figures, the
 * strategy — belongs to the Overview tab, not here. The masthead is the one
 * thing that stays on screen whichever tab is open, so it carries only what is
 * true of the application on every tab.
 */

/** The band in words, spoken as a decision rather than a label. */
export const VERDICT: Record<MatchCategory, string> = {
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

export function toneFor(matchCategory: MatchCategory | null): string {
  if (matchCategory === "priority_apply") return "var(--emerald)";
  if (matchCategory === "reject") return "var(--negative)";
  if (matchCategory === "referral_only") return "var(--warning)";
  return "var(--gold)";
}

/**
 * The three small glyphs on the meta line.
 *
 * Inline rather than an icon dependency: three 12px marks do not justify a
 * package, and `currentColor` keeps them on the same ink as the text they sit
 * beside in both themes.
 */
function Glyph({ name }: { name: "company" | "place" | "age" }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "shrink-0 opacity-70",
  };
  if (name === "company") {
    return (
      <svg {...common}>
        <path d="M2.5 13.5V3.2a.7.7 0 0 1 .7-.7h5.6a.7.7 0 0 1 .7.7v10.3M9.5 13.5V6.8h3.3a.7.7 0 0 1 .7.7v6M1 13.5h14M5 5.2h1.5M5 7.7h1.5M5 10.2h1.5" />
      </svg>
    );
  }
  if (name === "place") {
    return (
      <svg {...common}>
        <path d="M8 14.5s5-4.2 5-8a5 5 0 0 0-10 0c0 3.8 5 8 5 8Z" />
        <circle cx="8" cy="6.4" r="1.8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.4V8l2.4 1.6" />
    </svg>
  );
}

export function ScoreHero({
  score,
  matchCategory,
  company,
  location,
  age,
  title,
  actions,
}: {
  score: number | null;
  matchCategory: MatchCategory | null;
  company: string;
  location: string | null;
  /** "3 days old", or null where nothing dates the posting. */
  age?: string | null;
  title: string;
  /** The generate buttons, under the posting's facts. */
  actions?: ReactNode;
}) {
  const tone = toneFor(matchCategory);

  return (
    <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pt-2 pb-8">
      <div className="min-w-0 flex-1 basis-[22rem]">
        <p className="text-[10px] tracking-[0.18em] text-faint uppercase">Application</p>

        <h1 className="n-display mt-2.5 text-[clamp(2rem,4vw,2.875rem)] leading-[1.05] font-normal tracking-[-0.02em]">
          {title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-[13.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <Glyph name="company" />
            {company}
          </span>
          {location ? (
            <span className="flex items-center gap-1.5 text-faint">
              <Glyph name="place" />
              {location}
            </span>
          ) : null}
          {age ? (
            <span className="flex items-center gap-1.5 text-faint">
              <Glyph name="age" />
              {age}
            </span>
          ) : null}
        </div>

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
            <span
              className="mt-2.5 inline-block rounded-full border px-3 py-1 text-[11.5px] whitespace-nowrap"
              style={{
                color: "var(--gold)",
                borderColor: "color-mix(in srgb, var(--gold) 50%, transparent)",
              }}
            >
              Not scored · known sponsor
            </span>
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
