import Link from "next/link";

import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/base";
import { getBudgetStatus } from "@/features/ai/budget-queries";
import { getPipelineSummary } from "@/features/pipeline/dashboard-queries";
import {
  countUnattributedJobs,
  getRunOutcomes,
} from "@/features/ingestion/run-outcomes";
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

function runTone(status: IngestionRunStatus) {
  return status === "succeeded"
    ? "positive"
    : status === "partial"
      ? "warning"
      : status === "failed"
        ? "negative"
        : "info";
}

function Pile({
  label,
  count,
  hint,
  href,
  tone,
}: {
  label: string;
  count: number;
  hint: string;
  href?: string;
  tone: "positive" | "warning" | "negative" | "neutral";
}) {
  const colour = {
    positive: "text-positive",
    warning: "text-warning",
    negative: "text-negative",
    neutral: "text-muted",
  }[tone];

  const body = (
    <div className="px-4 py-3">
      <div className={`text-2xl font-semibold tabular-nums ${colour}`}>{count}</div>
      <div className="mt-0.5 text-xs font-medium">{label}</div>
      <p className="mt-1 text-[11px] text-subtle">{hint}</p>
    </div>
  );

  return (
    <Card className={href ? "transition-colors hover:bg-surface-muted" : ""}>
      {href ? <Link href={href}>{body}</Link> : body}
    </Card>
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
export default async function PipelinePage() {
  // Three round trips, not seven. On a one-connection serverless pool each
  // query is sequential, so fan-out is latency and connection pressure.
  const [piles, outcomes, unattributed, budget] = await Promise.all([
    getPipelineSummary(),
    getRunOutcomes(20),
    countUnattributedJobs(),
    getBudgetStatus(),
  ]);
  const awaiting = piles.awaitingScore;
  const orphaned = piles.orphanedPasses;

  const total = piles.pass + piles.review + piles.reject + piles.unevaluated;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Pipeline</h1>
        <p className="mt-0.5 text-xs text-muted">
          {total === 0
            ? "No jobs ingested yet."
            : `${total} job${total === 1 ? "" : "s"} ingested. Only qualified jobs become applications.`}
        </p>
      </div>

      {/* --- The piles (JSV2S1038) ------------------------------------- */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Pile
          label="Qualified"
          count={piles.pass}
          hint="Passed all four filters — these became applications"
          href="/applications"
          tone="positive"
        />
        <Pile
          label="Needs review"
          count={piles.review}
          hint="A filter could not be confirmed — one click to promote"
          href="/review"
          tone="warning"
        />
        <Pile
          label="Screened out"
          count={piles.reject}
          hint="A filter contradicted — kept, never deleted"
          href="/review?view=rejected"
          tone="negative"
        />
        <Pile
          label="Not evaluated"
          count={piles.unevaluated}
          hint="Ingested before the gate existed — run prequalify:backfill"
          tone="neutral"
        />
      </div>

      {/* --- Next run --------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Next scoring run"
          meta={awaiting === 0 ? "nothing waiting" : `${awaiting} job${awaiting === 1 ? "" : "s"} queued`}
        />
        <div className="space-y-2 px-4 py-3 text-xs">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-subtle">Today</span>
            <span className="tabular-nums">
              {formatUsd(budget.day.spentUsd)} of {formatUsd(budget.day.ceilingUsd)}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-subtle">This month</span>
            <span className="tabular-nums">
              {formatUsd(budget.month.spentUsd)} of {formatUsd(budget.month.ceilingUsd)}
            </span>
          </div>
          {budget.blocked ? (
            <p className="text-warning">{budget.reason}</p>
          ) : awaiting > 0 ? (
            <p className="text-subtle">
              Estimated {formatUsd(awaiting * 0.08)} to clear the queue at ~$0.08 a score.
            </p>
          ) : null}
        </div>
      </Card>

      {/* A qualified job with no application means the gate and the writer
          disagreed — worth surfacing rather than leaving to be noticed. */}
      {orphaned > 0 ? (
        <Card>
          <div className="px-4 py-3 text-xs text-warning">
            {orphaned} qualified job{orphaned === 1 ? " has" : "s have"} no application.
            That should not happen — the ingest transaction creates one for every
            pass. Worth investigating before the next run.
          </div>
        </Card>
      ) : null}

      {/* --- Per-run outcomes (JSV2S1158) ------------------------------- */}
      <Card>
        <CardHeader
          title="Runs"
          meta={
            unattributed > 0
              ? `${outcomes.length} recorded · ${unattributed} jobs predate run tracking`
              : `last ${outcomes.length}`
          }
        />
        {outcomes.length === 0 ? (
          <EmptyState
            title="No runs recorded"
            hint="Every upload and scheduled fetch now creates a run. The next one will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-[10px] tracking-wide text-faint uppercase">
                  <th className="px-4 py-2 font-medium">Run</th>
                  {/* The fetch half: what the actor returned and what never
                      became a job. These are stamped at ingest — a duplicate
                      or a validation reject leaves no row to count later. */}
                  <th className="px-2 py-2 text-right font-medium">Fetched</th>
                  <th className="px-2 py-2 text-right font-medium">Duplicate</th>
                  <th className="px-2 py-2 text-right font-medium">Rejected</th>
                  <th className="border-l border-line px-2 py-2 text-right font-medium">
                    Ingested
                  </th>
                  {/* The outcome half: derived live, because it keeps changing. */}
                  <th className="px-2 py-2 text-right font-medium">Auto qual.</th>
                  <th className="px-2 py-2 text-right font-medium">Force qual.</th>
                  <th className="px-2 py-2 text-right font-medium">Review</th>
                  <th className="px-2 py-2 text-right font-medium">Screened</th>
                  <th className="px-4 py-2 text-right font-medium">Binned</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={o.runId} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{o.source}</span>
                        <Badge tone={runTone(o.status)}>
                          {INGESTION_RUN_LABELS[o.status] ?? o.status}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-subtle">
                        {relative(o.startedAt)}
                        {!o.reconciles ? (
                          <span
                            className="ml-1.5 text-warning"
                            title="fetched does not equal ingested + duplicate + rejected"
                          >
                            · does not reconcile
                          </span>
                        ) : null}
                      </div>
                      <div
                        className="mt-0.5 font-mono text-[10px] text-faint"
                        title="Run id"
                      >
                        {o.runId}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">
                      {o.fetched || "—"}
                    </td>
                    {/* Paid for and discarded. The actor bills per result, so a
                        high number here is money spent on jobs already held —
                        which is what skipJobId exists to prevent. */}
                    <td className="px-2 py-2 text-right tabular-nums text-muted">
                      {o.duplicates || "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-negative">
                      {o.rejectedAtValidation || "—"}
                    </td>
                    <td className="border-l border-line px-2 py-2 text-right font-medium tabular-nums">
                      {o.landed || "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-positive">
                      {o.autoQualified || "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {o.forceQualified || "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-warning">
                      {o.needsReview || "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">
                      {o.screenedOut || "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-faint">
                      {o.binned || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* The funnel arithmetic, spelled out once so the columns are readable
            without guessing what adds to what. */}
        {outcomes.length > 0 ? (
          <p className="border-t border-line px-4 py-2 text-[11px] text-subtle">
            Fetched = Duplicate + Rejected + Ingested. Duplicates were paid for
            and discarded — the actor bills per result, so that column is the
            cost of fetching jobs already held.
          </p>
        ) : null}

        {unattributed > 0 ? (
          <p className="border-t border-line px-4 py-2 text-[11px] text-subtle">
            {unattributed} jobs were ingested before runs were recorded and belong
            to no run. They are counted in the queues above but cannot appear in
            this table — said plainly rather than left to look like a discrepancy.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
