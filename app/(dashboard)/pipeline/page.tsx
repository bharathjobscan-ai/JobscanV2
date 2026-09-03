import Link from "next/link";

import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/base";
import { getBudgetStatus } from "@/features/ai/budget-queries";
import {
  countAwaitingScore,
  countOrphanedPasses,
  countPiles,
  listRuns,
} from "@/features/pipeline/dashboard-queries";
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
  const [piles, runs, awaiting, orphaned, budget] = await Promise.all([
    countPiles(),
    listRuns(20),
    countAwaitingScore(),
    countOrphanedPasses(),
    getBudgetStatus(),
  ]);

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

      {/* --- Run history (JSV2S1011, 1012) ------------------------------ */}
      <Card>
        <CardHeader title="Runs" meta={runs.length > 0 ? `last ${runs.length}` : undefined} />
        {runs.length === 0 ? (
          <EmptyState
            title="No runs recorded"
            hint="Scheduled runs appear here once the nightly workflow has executed. A manual upload does not create a run."
          />
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((run) => (
              <li key={run.id} className="px-4 py-2 text-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {run.source} <span className="text-subtle">· {run.trigger}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={runTone(run.status)}>
                      {INGESTION_RUN_LABELS[run.status] ?? run.status}
                    </Badge>
                    <span className="text-subtle">{relative(run.startedAt)}</span>
                  </span>
                </div>
                <div className="mt-0.5 text-subtle tabular-nums">
                  fetched {run.fetched} · new {run.inserted} · duplicate {run.duplicates} ·
                  rejected {run.rejected}
                  {run.durationMs ? ` · ${(run.durationMs / 1000).toFixed(1)}s` : ""}
                </div>
                {run.error ? <p className="mt-0.5 text-negative">{run.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
