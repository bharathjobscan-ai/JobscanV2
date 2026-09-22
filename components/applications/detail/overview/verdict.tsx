import { buttonClass } from "@/components/ui/base";
import { MATCH_HINTS, type MatchCategory } from "@/lib/config/constants";

import { TabSwitch } from "./tab-switch";

/**
 * The verdict, said in a sentence before it is said in a number.
 *
 * The design opens the Overview with a serif line that is a decision — "Apply,
 * and ask for a referral" — and only then explains it. The headline is derived
 * from the band in code, so it can never disagree with the pill in the
 * masthead; the prose underneath is the model's own summary, never rewritten
 * here.
 */

/**
 * The gold-outlined door to the arithmetic.
 *
 * Outlined rather than filled: it sits next to prose, and a solid gold block
 * there would out-shout the score itself.
 */
export const GOLD_OUTLINE =
  "inline-flex min-h-9 cursor-pointer items-center rounded-md border border-accent/55 px-3.5 text-[13px] whitespace-nowrap text-accent transition-colors hover:bg-accent/10";

const HEADLINE: Record<MatchCategory, string> = {
  priority_apply: "Apply immediately, and open a line to the team",
  apply: "Apply, and ask for a referral",
  referral_only: "Worth it only with a referral",
  reject: "Skip it",
  gate_qualified: "Worth applying",
};

export function VerdictBlock({
  matchCategory,
  summary,
  hasAnalysis,
  hasMaterial,
}: {
  matchCategory: MatchCategory | null;
  /** The stored one-line reading. Absent until a score has been generated. */
  summary?: string | null;
  hasAnalysis: boolean;
  hasMaterial: boolean;
}) {
  const headline = matchCategory ? HEADLINE[matchCategory] : "Not yet judged";
  /*
   * The prose under the headline is the model's own summary. Without one, the
   * band's advice stands in — except for a gate-qualified application, where
   * the reason there is no summary IS the answer, and repeating the masthead's
   * pill would say nothing.
   */
  const fallback =
    matchCategory === "gate_qualified"
      ? "Every pre-qualification filter passed and the company is a known sponsor, so no scoring call was made. Nothing is waiting on a number."
      : matchCategory
        ? MATCH_HINTS[matchCategory]
        : "No score and no gate verdict have been recorded for this application yet.";

  return (
    <section>
      <p className="n-display text-[clamp(1.6rem,3vw,2.125rem)] leading-tight font-semibold tracking-[-0.02em]">
        {headline}
      </p>
      <p className="mt-2.5 max-w-[62ch] text-[16px] leading-[1.6] text-muted">
        {summary ?? fallback}
      </p>

      {hasAnalysis || hasMaterial ? (
        <div className="mt-6 flex flex-wrap gap-2.5">
          {hasAnalysis ? (
            <TabSwitch to="analysis" className={GOLD_OUTLINE}>
              View the arithmetic →
            </TabSwitch>
          ) : null}
          {hasMaterial ? (
            <TabSwitch to="material" className={`${buttonClass.ghost} whitespace-nowrap`}>
              Open material
            </TabSwitch>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
