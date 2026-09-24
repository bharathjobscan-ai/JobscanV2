import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/base";
import { getBudgetStatus } from "@/features/ai/budget-queries";
import { getPipelineSummary } from "@/features/pipeline/dashboard-queries";
import {
  RUN_RANGES,
  RUNS_PER_PAGE,
  getRunOutcomes,
  isoDay,
  resolveWindow,
  todayWindow,
  type PileSnapshot,
  type RunRange,
} from "@/features/ingestion/run-outcomes";
import { RunFilters, RunPager, runsHref } from "@/components/pipeline/run-filters";
import { INGESTION_RUN_LABELS, type IngestionRunStatus } from "@/lib/config/constants";
import { formatUsd } from "@/lib/ai/pricing";

export const dynamic = "force-dynamic";

function relative(date: Date | null): string {
  if (!date) return "—";
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** The design states a run's outcome as coloured words, not as a chip. */
function runToneClass(status: IngestionRunStatus): string {
  return status === "succeeded"
    ? "text-positive"
    : status === "partial"
      ? "text-warning"
      : status === "failed"
        ? "text-negative"
        : "text-muted";
}

/**
 * One pile, as a rule and a number rather than a card (JSV2S1038).
 *
 * The design gives each pile a coloured 2px rule and nothing else — the bar
 * above already carries the enclosure, so a second border around each figure
 * would be the same information drawn twice.
 */
function Pile({
  label,
  count,
  today,
  scope,
  hint,
  href,
  rule,
  dim = false,
  lead = false,
}: {
  label: string;
  count: number;
  today: number;
  /**
   * Which figure leads. The toggle moved only the bar before this existed, so
   * switching to Today redrew the proportions while the numbers beneath went
   * on reading all-time — the bar and its own labels disagreeing.
   */
  scope: "all" | "today";
  hint: string;
  href?: string;
  rule: string;
  dim?: boolean;
  /**
   * The figure the page exists to report. Only Qualified carries it: these are
   * the jobs that became applications, and the other three piles are the cost
   * of finding them.
   */
  lead?: boolean;
}) {
  const headline = scope === "today" ? today : count;
  const body = (
    <>
      <div
        className={`n-display leading-none font-semibold tabular-nums ${
          lead ? "text-[44px]" : "text-[30px]"
        }`}
        style={dim ? { color: "var(--faint)" } : lead ? { color: rule } : undefined}
      >
        {headline}
      </div>
      <div className={`mt-2 text-[13.5px] ${dim ? "text-muted" : ""}`}>{label}</div>
      {/* The other scale, named. Two bare numbers side by side would be a
          puzzle rather than a reading. */}
      <div className="n-mono mt-1 text-[11.5px] text-subtle">
        {scope === "today" ? `${count} all time` : `${today} today`}
      </div>
      <p className="mt-0.5 text-xs text-subtle">{hint}</p>
    </>
  );

  return (
    <div className="pt-3" style={{ borderTop: `2px solid ${rule}` }}>
      {href ? (
        <Link href={href} className="block transition-opacity hover:opacity-80">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

/**
 * One proportional bar, named (2026-09-24).
 *
 * `flexGrow` carries the counts so the bar needs no arithmetic and a zero pile
 * simply disappears. A day with nothing in it would otherwise draw an empty
 * rule that looks like a rendering fault, so it says what it is instead.
 */
function ProportionBar({ piles, total }: { piles: PileSnapshot; total: number }) {
  return (
    <div className="mt-4 flex items-center gap-4">
      {total === 0 ? (
        <span className="text-[12.5px] text-subtle">Nothing yet</span>
      ) : (
        <div
          className="flex h-11 flex-1 items-stretch overflow-hidden rounded"
          style={{ background: "var(--hair)" }}
          aria-hidden="true"
        >
          <div
            style={{
              flexGrow: piles.pass,
              background: "color-mix(in srgb, var(--positive) 55%, transparent)",
            }}
          />
          <div
            style={{
              flexGrow: piles.review,
              background: "color-mix(in srgb, var(--warning) 60%, transparent)",
            }}
          />
          <div
            style={{
              flexGrow: piles.reject,
              background: "color-mix(in srgb, var(--negative) 55%, transparent)",
            }}
          />
          <div style={{ flexGrow: piles.unevaluated, background: "var(--border)" }} />
        </div>
      )}
    </div>
  );
}

/**
 * The pipeline view (JSV2S1011, 1012, 1038, 1043).
 *
 * Answers three questions the applications board structurally cannot: what did
 * last night's run do, where did everything it fetched end up, and what is the
 * next run going to spend. Every query here is rooted at `raw_jobs`, because a
 * screened-out job has no application and is invisible to the other board.
 */

/**
 * A count that navigates to the rows it counts (2026-09-21).
 *
 * The per-run metrics answer "what became of last night's fetch" and then leave
 * you to reconstruct the filter by hand to see WHICH jobs. Every destination
 * already accepts a `fetch` selection, so the number is one `href` away from
 * being the query.
 *
 * Zero is deliberately not a link: a filter that is guaranteed to return
 * nothing is a dead end, and an em dash says so more honestly than a link would.
 */
function DrillDown({
  count,
  href,
  title,
  className = "",
}: {
  count: number;
  href: string;
  title: string;
  className?: string;
}) {
  if (!count) return <span className="text-subtle">—</span>;
  return (
    <Link
      href={href}
      title={title}
      className={`underline decoration-dotted underline-offset-2 hover:decoration-solid ${className}`}
    >
      {count}
    </Link>
  );
}

/** A metric inside an opened run: label in slate, figure in platinum. */
function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      {label} <span style={{ color: "var(--platinum)" }}>{children}</span>
    </div>
  );
}

/** A budget window as a hairline meter — the design's only progress element. */
function BudgetBar({
  label,
  spentUsd,
  ceilingUsd,
}: {
  label: string;
  spentUsd: number;
  ceilingUsd: number;
}) {
  const pct = ceilingUsd > 0 ? Math.min(100, Math.round((spentUsd / ceilingUsd) * 100)) : 0;
  return (
    <div>
      <div className="n-mono flex justify-between text-[12.5px] text-muted">
        <span>{label}</span>
        <span>
          {formatUsd(spentUsd)} of {formatUsd(ceilingUsd)}
        </span>
      </div>
      <div className="mt-2 h-1" style={{ background: "var(--hair)" }}>
        <div className="h-1 bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  /**
   * Closed by default, and then the page is about today (2026-09-24).
   *
   * Eight runs land a night, so an unbounded list answers "what happened
   * overnight" with a year of history. History is a deliberate second click,
   * and everything about that click lives in the URL so the view is linkable.
   */
  const showAll = one("runs") === "all";
  const rangeParam = one("range");
  const range = RUN_RANGES.includes(rangeParam as RunRange) ? (rangeParam as RunRange) : null;
  const resolved = showAll
    ? resolveWindow(range, one("from"), one("to"))
    : { window: todayWindow(), from: null, to: null, clampedTo: null };

  const requestedPage = Number.parseInt(one("page") ?? "1", 10);
  const page = showAll && Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  // Three round trips, not seven. On a one-connection serverless pool each
  // query is sequential, so fan-out is latency and connection pressure.
  /**
   * THREE queries, not four. The pool holds three connections and postgres.js
   * has no pool-acquire timeout, so a fourth parallel query waits indefinitely
   * and starves every other request on the instance — see lib/db/client.ts.
   */
  const [piles, runOutcomes, budget] = await Promise.all([
    getPipelineSummary(),
    getRunOutcomes({
      window: resolved.window,
      limit: RUNS_PER_PAGE,
      offset: (page - 1) * RUNS_PER_PAGE,
    }),
    getBudgetStatus(),
  ]);
  const { runs: outcomes, unattributed } = runOutcomes;
  const awaiting = piles.awaitingScore;
  const orphaned = piles.orphanedPasses;

  const total = piles.pass + piles.review + piles.reject + piles.unevaluated;
  const todayTotal =
    runOutcomes.today.pass +
    runOutcomes.today.review +
    runOutcomes.today.reject +
    runOutcomes.today.unevaluated;

  /*
   * Which scale the single bar is showing.
   *
   * Today by default, matching the run table above it. The page answers "what
   * happened overnight", and opening on a standing all-time picture made the
   * two halves of the screen describe different periods.
   */
  const pileScope = one("piles") === "all" ? "all" : "today";
  const shownPiles = pileScope === "today" ? runOutcomes.today : piles;
  const shownTotal = pileScope === "today" ? todayTotal : total;

  const totalPages = Math.max(1, Math.ceil(runOutcomes.total / RUNS_PER_PAGE));
  const filterState = { range, from: resolved.from, to: resolved.to, page };

  return (
    <div className="mx-auto max-w-[1060px]">
      <h1 className="n-display text-[38px] leading-tight font-normal tracking-[-0.02em]">
        Pipeline
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        {total === 0
          ? "No jobs ingested yet. Only qualified jobs become applications."
          : `${total} job${total === 1 ? "" : "s"} ingested. Only qualified jobs become applications.`}
      </p>

      {/*
        --- The piles (JSV2S1038) ---------------------------------------
        ONE bar, switched rather than duplicated. Two bars read as rival
        claims rather than as one measure at two scales; a toggle makes the
        comparison sequential, which is how it is actually read.

        A link, not a button: the choice belongs in the URL so the view is
        linkable and no client JavaScript is needed to hold it.
      */}
      <div className="mt-5 flex items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-line text-[11.5px]">
          {(["today", "all"] as const).map((scope) => {
            const active = pileScope === scope;
            const next = new URLSearchParams(
              Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])),
            );
            // Today is the default, so it is the absence of the param.
            if (scope === "today") next.delete("piles");
            else next.set("piles", scope);
            const qs = next.toString();
            return (
              <Link
                key={scope}
                href={qs ? `/pipeline?${qs}` : "/pipeline"}
                className="px-3 py-1.5 transition-colors"
                style={
                  active
                    ? { background: "var(--gold)", color: "#0b0b0f", fontWeight: 600 }
                    : { color: "var(--slate)" }
                }
              >
                {scope === "all" ? "All time" : "Today"}
              </Link>
            );
          })}
        </div>
        <span className="n-mono text-[11.5px] text-subtle">
          {shownTotal} job{shownTotal === 1 ? "" : "s"}{" "}
          {pileScope === "today" ? "ingested today" : "ingested, all time"}
        </span>
      </div>

      <ProportionBar piles={shownPiles} total={shownTotal} />

      <div className="mt-4 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
        <Pile
          label="Qualified"
          scope={pileScope}
          lead
          count={piles.pass}
          today={runOutcomes.today.pass}
          hint="Passed every filter — these became applications"
          href="/applications"
          rule="var(--positive)"
        />
        <Pile
          label="Needs review"
          scope={pileScope}
          count={piles.review}
          today={runOutcomes.today.review}
          hint="A filter could not be confirmed — one click to promote"
          href="/review"
          rule="var(--warning)"
        />
        <Pile
          label="Screened out"
          scope={pileScope}
          count={piles.reject}
          today={runOutcomes.today.reject}
          hint="A filter contradicted — kept, never deleted"
          href="/review?view=rejected"
          rule="var(--negative)"
        />
        <Pile
          label="Not evaluated"
          scope={pileScope}
          count={piles.unevaluated}
          today={runOutcomes.today.unevaluated}
          hint="Ingested before the gate existed — run prequalify:backfill"
          rule="var(--hair)"
          dim
        />
      </div>

      {/* --- Next run --------------------------------------------------- */}
      <section className="mt-10 rounded-[7px] bg-surface px-6 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="n-display text-[21px] font-semibold">Next scoring run</h2>
          <span className="n-mono text-[12.5px] text-muted">
            {awaiting === 0
              ? "nothing waiting"
              : `${awaiting} queued · about ${formatUsd(awaiting * 0.08)} to clear`}
          </span>
        </div>

        <div className="mt-[18px] grid gap-[22px] sm:grid-cols-2">
          <BudgetBar
            label="Today"
            spentUsd={budget.day.spentUsd}
            ceilingUsd={budget.day.ceilingUsd}
          />
          <BudgetBar
            label="This month"
            spentUsd={budget.month.spentUsd}
            ceilingUsd={budget.month.ceilingUsd}
          />
        </div>

        {budget.blocked ? (
          <p className="mt-5 text-[12.5px] text-warning">{budget.reason}</p>
        ) : awaiting > 0 ? (
          <p className="mt-5 text-[12.5px] text-subtle">
            Estimated at ~$0.08 a score. The next scheduled run clears the queue.
          </p>
        ) : null}
      </section>

      {/* A qualified job with no application means the gate and the writer
          disagreed — worth surfacing rather than leaving to be noticed. */}
      {orphaned > 0 ? (
        <p className="mt-4 rounded-[7px] bg-surface px-6 py-4 text-[12.5px] text-warning">
          {orphaned} qualified job{orphaned === 1 ? " has" : "s have"} no application.
          That should not happen — the ingest transaction creates one for every
          pass. Worth investigating before the next run.
        </p>
      ) : null}

      {/* --- Per-run outcomes (JSV2S1158) -------------------------------
          Twelve columns became a summary line that opens. The figures are the
          same ones; a twelve-column table at this type size was unreadable and
          the design has no table here. The drill-through links survive inside
          the opened row, which is where there is finally room to label them. */}
      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="n-display text-2xl font-normal">
          {showAll ? "Runs" : "Runs today"}
        </h2>
        <div className="flex flex-wrap items-baseline gap-4">
          <span className="n-mono text-[12.5px] text-subtle">
            {unattributed > 0
              ? `${runOutcomes.total} recorded · ${unattributed} jobs predate run tracking`
              : `${runOutcomes.total} recorded`}
          </span>
          <Link
            href={showAll ? "/pipeline" : runsHref({})}
            className="text-[12.5px] underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {showAll ? "Today only" : "View all runs"}
          </Link>
        </div>
      </div>

      {showAll ? <RunFilters state={filterState} clampedTo={resolved.clampedTo} /> : null}

      {outcomes.length === 0 ? (
        <EmptyState
          title={showAll ? "No runs in this range" : "No runs today"}
          hint={
            showAll
              ? "Nothing ran between those dates. Widen the range, or clear the filter."
              : `Nothing has run since midnight. Open the history to see earlier runs — ${isoDay(new Date())} is a quiet day so far.`
          }
        />
      ) : (
        <div className="mt-3.5 border-t border-line">
          {outcomes.map((o) => (
            <details key={o.runId} className="group border-b border-line">
              <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3.5 sm:grid-cols-[110px_minmax(0,1fr)_auto_auto] [&::-webkit-details-marker]:hidden">
                {/* The city leads and the source sits under it: eight runs a
                    night share one source and differ only by where they
                    looked, so the location is what identifies a row and the
                    source is the footnote. */}
                <span className="flex flex-col leading-tight">
                  <span className="text-[13.5px]">{o.location ?? o.source}</span>
                  {o.location ? (
                    <span className="text-[11.5px]" style={{ color: "var(--slate)" }}>
                      {o.source}
                    </span>
                  ) : null}
                </span>
                <span className="n-mono hidden truncate text-[12.5px] text-muted sm:block">
                  {o.fetched} fetched · {o.landed} ingested · {o.autoQualified + o.forceQualified}{" "}
                  qualified
                  {o.costUsd === null ? "" : ` · ${formatUsd(o.costUsd)}`}
                </span>
                <span className={`text-[12.5px] whitespace-nowrap ${runToneClass(o.status)}`}>
                  {INGESTION_RUN_LABELS[o.status] ?? o.status}
                </span>
                <span className="n-mono text-[12.5px] whitespace-nowrap text-subtle">
                  {relative(o.startedAt)}
                </span>
              </summary>

              <div className="n-mono grid gap-x-5 gap-y-3 pb-4 text-[12.5px] text-muted sm:grid-cols-3 lg:grid-cols-4">
                <Metric label="Fetched">{o.fetched || "—"}</Metric>
                {/* Paid for and discarded. The actor bills per result, so a
                    high number here is money spent on jobs already held —
                    which is what skipJobId exists to prevent. */}
                <Metric label="Duplicate">{o.duplicates || "—"}</Metric>
                <Metric label="Rejected">
                  <span className="text-negative">{o.rejectedAtValidation || "—"}</span>
                </Metric>
                <Metric label="Ingested">{o.landed || "—"}</Metric>

                <Metric label="Auto qualified">
                  <DrillDown
                    count={o.autoQualified}
                    href={`/applications?fetch=${o.runId}`}
                    title="Applications created by this fetch"
                    className="text-positive"
                  />
                </Metric>
                <Metric label="Force qualified">
                  <DrillDown
                    count={o.forceQualified}
                    href={`/applications?fetch=${o.runId}`}
                    title="Promoted by hand from this fetch"
                  />
                </Metric>
                <Metric label="Review">
                  <DrillDown
                    count={o.needsReview}
                    href={`/review?fetch=${o.runId}`}
                    title="Waiting on a decision from this fetch"
                    className="text-warning"
                  />
                </Metric>
                <Metric label="Screened out">
                  <DrillDown
                    count={o.screenedOut}
                    href={`/review?view=rejected&fetch=${o.runId}`}
                    title="Screened out by the gate on this fetch"
                    className="text-muted"
                  />
                </Metric>
                <Metric label="Binned">
                  <DrillDown
                    count={o.binned}
                    href={`/review?view=binned&fetch=${o.runId}`}
                    title="Moved to the Bin from this fetch"
                    className="text-muted"
                  />
                </Metric>

                {/* JSV2S1144 — what the fetch cost, and what that works out
                    at per application it actually produced. */}
                <Metric label="Cost">
                  {o.costUsd === null ? (
                    <span className="text-subtle" title="This source costs nothing">
                      free
                    </span>
                  ) : (
                    formatUsd(o.costUsd)
                  )}
                </Metric>
                <Metric label="Per application">
                  {o.costPerApplicationUsd === null ? "—" : formatUsd(o.costPerApplicationUsd)}
                </Metric>

                {!o.reconciles ? (
                  <p
                    className="text-warning sm:col-span-3 lg:col-span-4"
                    title="fetched does not equal ingested + duplicate + rejected"
                  >
                    Does not reconcile — something was lost between the actor and
                    the database without being counted.
                  </p>
                ) : null}
                <p className="text-subtle sm:col-span-3 lg:col-span-4" title="Run id">
                  {o.runId}
                </p>
              </div>
            </details>
          ))}
        </div>
      )}

      {showAll ? (
        <RunPager
          state={filterState}
          page={page}
          totalPages={totalPages}
          total={runOutcomes.total}
        />
      ) : null}

      {/* The funnel arithmetic, spelled out once so the figures are readable
          without guessing what adds to what. */}
      {outcomes.length > 0 ? (
        <p className="mt-4 max-w-[78ch] text-[11.5px] text-subtle">
          Fetched = Duplicate + Rejected + Ingested. Duplicates were paid for and
          discarded — the actor bills per result, so that figure is the cost of
          fetching jobs already held. Cost per application is the run divided by
          the applications it produced, which is far higher than the per-job cost
          and is the figure that matters.
        </p>
      ) : null}

      {unattributed > 0 ? (
        <p className="mt-2 max-w-[78ch] text-[11.5px] text-subtle">
          {unattributed} jobs were ingested before runs were recorded and belong
          to no run. They are counted in the piles above but cannot appear in
          this list — said plainly rather than left to look like a discrepancy.
        </p>
      ) : null}
    </div>
  );
}
