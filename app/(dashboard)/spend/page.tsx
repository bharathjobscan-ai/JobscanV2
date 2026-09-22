import Link from "next/link";

import { inputClass } from "@/components/ui/base";
import { getSpendSummary } from "@/features/ai/spend";
import { formatUsd } from "@/lib/ai/pricing";

export const dynamic = "force-dynamic";

/**
 * Cost dashboard (JSV2S1134).
 *
 * "What has this cost me, to a date" — a different question from the
 * per-application figure in the workspace, and it needs all three pricing
 * models in one view: AI per token, Apify per result, grounding per request.
 *
 * The design leads with one very large total and then spends the rest of the
 * screen making it actionable, because a total alone tells you nothing you can
 * change. Nothing here is a card: the figures are separated by rules and space.
 */

/** A small figure with its unit above it — the design's paired statistic. */
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "warning" | "negative";
}) {
  const colour =
    tone === "negative"
      ? "text-negative"
      : tone === "warning"
        ? "text-warning"
        : tone === "positive"
          ? "text-positive"
          : "";
  return (
    <div>
      <p className="text-[10px] tracking-[0.12em] text-subtle uppercase">{label}</p>
      <p className={`n-display mt-1 text-2xl font-semibold tabular-nums ${colour}`}>{value}</p>
      {hint ? <p className="n-mono mt-0.5 text-[11.5px] text-subtle">{hint}</p> : null}
    </div>
  );
}

/** ISO date `n` days back, for the quick ranges. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default async function SpendPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = isDate(params.from);
  const to = isDate(params.to);

  const spend = await getSpendSummary(from, to);

  // The per-application target the owner set: ~$0.20, hard maximum $0.25.
  // The marginal figure, not the average. Dividing by EVERY application
  // includes ones never scored, which flatters the number badly on a corpus
  // that was mostly backfilled.
  const perApp = spend.costPerProcessedUsd;
  const perAppTone =
    perApp === null ? undefined : perApp > 0.25 ? "negative" : perApp > 0.2 ? "warning" : "positive";

  /* The design replaces the date pickers with a segmented control. Both are
     kept: the presets cover the question actually asked most days, and the
     pickers still answer an arbitrary one. Every range is a URL, so a view
     stays linkable and the back button works. */
  const ranges = [
    { label: "All time", href: "/spend", active: !from && !to },
    { label: "30 days", href: `/spend?from=${daysAgo(30)}`, active: from === daysAgo(30) && !to },
    { label: "7 days", href: `/spend?from=${daysAgo(7)}`, active: from === daysAgo(7) && !to },
    { label: "Today", href: `/spend?from=${daysAgo(0)}`, active: from === daysAgo(0) && !to },
  ];

  const rangeLabel =
    from || to ? `${from ?? "the beginning"} to ${to ?? "today"}` : "all time";

  const totalRuns = spend.aiRuns + spend.ingestionRuns;

  /* The standfirst names the largest line. `slices` arrives in a fixed order —
     scoring, documents, evaluation, fetch — so the first one is not the
     biggest and reading it as such would name the wrong line. */
  const biggest = spend.slices.reduce<(typeof spend.slices)[number] | null>(
    (best, s) => (best === null || s.usd > best.usd ? s : best),
    null,
  );

  return (
    <div className="mx-auto max-w-[1060px]">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="n-display text-[38px] leading-tight font-normal tracking-[-0.02em]">
            Cost
          </h1>
          <p className="mt-1 text-[13px] text-muted">What the AI cost, and what it bought.</p>
        </div>

        <div className="flex gap-1 rounded-full border border-line p-[3px]">
          {ranges.map((r) => (
            <Link
              key={r.label}
              href={r.href}
              className={`rounded-full px-3 py-1 text-xs whitespace-nowrap transition-colors ${
                r.active
                  ? "bg-accent font-medium text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      {/* --- Headline ----------------------------------------------------- */}
      <div className="mt-9 grid items-start gap-10 lg:grid-cols-2">
        <div>
          <div className="text-[10px] tracking-[0.16em] text-subtle uppercase">
            Total spent · {rangeLabel}
          </div>
          <div
            className="n-display mt-2.5 text-[74px] leading-none font-normal tracking-[-0.03em] tabular-nums"
            style={{ color: "var(--gold)" }}
          >
            {formatUsd(spend.totalUsd)}
          </div>
          <div className="n-mono mt-2.5 text-[13px] text-muted">
            {formatUsd(spend.aiUsd)} model calls · {formatUsd(spend.ingestionUsd)} fetching ·{" "}
            {totalRuns} run{totalRuns === 1 ? "" : "s"}
          </div>
          <p className="n-display mt-5 max-w-[34ch] text-[19px] leading-[1.5] text-muted">
            {spend.totalUsd === 0
              ? "Nothing spent in this window."
              : `${
                  spend.costPerJobUsd === null ? "—" : formatUsd(spend.costPerJobUsd)
                } a job seen.${
                  biggest && biggest.usd > 0
                    ? ` The line worth watching is ${biggest.label.toLowerCase()}, at ${Math.round(
                        biggest.share * 100,
                      )}% of everything.`
                    : ""
                }`}
          </p>
        </div>

        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-5 border-t border-line pt-4">
            <Stat
              label="Per job seen"
              value={spend.costPerJobUsd === null ? "—" : formatUsd(spend.costPerJobUsd)}
              hint={`${spend.jobsIngested} job${spend.jobsIngested === 1 ? "" : "s"}`}
            />
            <Stat
              label="Per application worked"
              value={perApp === null ? "—" : formatUsd(perApp)}
              hint={
                perApp === null
                  ? "nothing processed"
                  : `${spend.processedApplications} of ${spend.applications} processed · target $0.20`
              }
              tone={perAppTone}
            />
          </div>

          {/* A plain GET form: the window lives in the URL, so an arbitrary
              range is as linkable as a preset. */}
          <form
            method="get"
            action="/spend"
            className="flex flex-wrap items-end gap-2 border-t border-line pt-4"
          >
            <label className="flex flex-col gap-1">
              <span className="text-[10px] tracking-[0.12em] text-subtle uppercase">From</span>
              <input
                type="date"
                name="from"
                defaultValue={from ?? ""}
                className={`${inputClass} w-36`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] tracking-[0.12em] text-subtle uppercase">To</span>
              <input
                type="date"
                name="to"
                defaultValue={to ?? ""}
                className={`${inputClass} w-36`}
              />
            </label>
            <button
              type="submit"
              className="h-9 rounded-md bg-accent px-3 text-xs font-medium text-background hover:opacity-85"
            >
              Apply
            </button>
          </form>
        </div>
      </div>

      {/* --- The split ---------------------------------------------------- */}
      <h2 className="n-display mt-12 text-2xl font-normal">Where it went</h2>
      {spend.totalUsd === 0 ? (
        <p className="mt-3.5 border-t border-line pt-4 text-[13px] text-muted">
          Nothing spent in this window.
        </p>
      ) : (
        <div className="mt-3.5 border-t border-line">
          {spend.slices.map((slice) => (
            <div key={slice.key} className="border-b border-line py-4">
              <div className="grid grid-cols-[minmax(0,1fr)_90px] items-baseline gap-5">
                <div className="text-[14.5px]">{slice.label}</div>
                <div className="n-display text-right text-xl whitespace-nowrap tabular-nums">
                  {formatUsd(slice.usd)}
                </div>
              </div>
              <div className="mt-2.5 h-[3px]" style={{ background: "var(--hair)" }}>
                <div
                  className="h-[3px] bg-accent"
                  style={{ width: `${Math.round(slice.share * 100)}%` }}
                />
              </div>
              <p className="n-mono mt-2 text-xs text-subtle">
                {Math.round(slice.share * 100)}% · {slice.runs} run
                {slice.runs === 1 ? "" : "s"}
                {slice.runs > 0 ? ` · ${formatUsd(slice.usd / slice.runs)} each` : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* --- Caveats ------------------------------------------------------
          Stated rather than hidden: a cost figure that quietly excludes things
          is worse than one that says what it excludes. */}
      {spend.unratedRuns > 0 ||
      spend.unmeasuredRuns > 0 ||
      spend.groundedRuns > 0 ||
      spend.applications > spend.processedApplications ? (
        <div className="mt-8 max-w-[78ch] rounded-[7px] bg-surface px-[22px] py-5 text-[13px] text-muted">
          <div className="text-[10px] tracking-[0.14em] text-subtle uppercase">
            What these numbers exclude
          </div>
          {spend.unmeasuredRuns > 0 ? (
            <p className="mt-2.5">
              <span style={{ color: "var(--platinum)" }}>
                {spend.unmeasuredRuns} run{spend.unmeasuredRuns === 1 ? "" : "s"}
              </span>{" "}
              reported no token usage, so their cost is unknowable — excluded
              rather than counted as free.
            </p>
          ) : null}
          {spend.unratedRuns > 0 ? (
            <p className="mt-1.5">
              <span className="text-warning">
                {spend.unratedRuns} run{spend.unratedRuns === 1 ? "" : "s"}
              </span>{" "}
              used a model with no rate on file. Add it to{" "}
              <code className="n-mono text-[11.5px]">MODEL_RATES</code> rather than guessing.
            </p>
          ) : null}
          {spend.applications > spend.processedApplications ? (
            <p className="mt-1.5">
              <span style={{ color: "var(--platinum)" }}>
                {spend.applications - spend.processedApplications} application
                {spend.applications - spend.processedApplications === 1 ? "" : "s"}
              </span>{" "}
              have had no AI spent on them. Cost per application divides by the{" "}
              {spend.processedApplications} actually processed — dividing by all
              of them would report{" "}
              {spend.costPerApplicationUsd === null
                ? "—"
                : formatUsd(spend.costPerApplicationUsd)}{" "}
              and flatter the figure.
            </p>
          ) : null}
          {spend.groundedRuns > 0 ? (
            <p className="mt-1.5">
              <span style={{ color: "var(--platinum)" }}>
                {spend.groundedRuns} run{spend.groundedRuns === 1 ? "" : "s"}
              </span>{" "}
              used Google Search grounding. It bills per request against a shared
              5,000 a month, so only those past the allowance are charged here —
              the rest genuinely cost nothing.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
