import type { ApplicationCost } from "@/features/ai/queries";
import { formatUsd, GROUNDING_COST_PER_REQUEST } from "@/lib/ai/pricing";
import type { GroundingUsage } from "@/features/ai/grounding";
import { Card, CardHeader } from "@/components/ui/base";

/**
 * JSV2S1132 — AI cost for one application, per run.
 *
 * Deliberately itemised rather than a single number: the point is to see which
 * task and which model the money went to, because that is the only actionable
 * form. A total alone tells you nothing you can change.
 */

const compactTokens = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-subtle">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Grounding against the monthly free allowance (JSV2S1131).
 *
 * Shown here because this is where cost is read, but it is a MONTH-WIDE figure,
 * not this application's — grounding bills per request against a shared 5,000,
 * so the number that matters is how close the account is to the cliff.
 */
function GroundingMeter({ grounding }: { grounding: GroundingUsage }) {
  if (grounding.used === 0) return null;

  return (
    <div className="border-t border-line px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-subtle">Google Search grounding, this month</span>
        <span
          className={`tabular-nums ${
            grounding.exhausted
              ? "text-negative"
              : grounding.warn
                ? "text-warning"
                : ""
          }`}
        >
          {grounding.used.toLocaleString()} / {grounding.free.toLocaleString()}
        </span>
      </div>

      <div className="mt-1.5 h-1 rounded-full bg-surface-muted">
        <div
          className={`h-1 rounded-full ${
            grounding.exhausted
              ? "bg-negative"
              : grounding.warn
                ? "bg-warning"
                : "bg-positive"
          }`}
          style={{ width: `${Math.round(grounding.ratio * 100)}%` }}
        />
      </div>

      <p className="mt-1.5 text-[11px] text-subtle">
        {grounding.exhausted
          ? `Allowance spent. Each further grounded scoring run costs ${formatUsd(
              grounding.marginalUsd,
            )} — ${formatUsd(grounding.billableUsd)} billed so far this month.`
          : grounding.warn
            ? `${grounding.remaining.toLocaleString()} left. Past this, each grounded run costs ${formatUsd(
                GROUNDING_COST_PER_REQUEST,
              )} and the totals above start understating spend.`
            : `${grounding.remaining.toLocaleString()} left. Billed per request, not per token, so this is not in the figures above.`}
      </p>
    </div>
  );
}

export function AiCostCard({
  cost,
  grounding,
}: {
  cost: ApplicationCost;
  grounding?: GroundingUsage;
}) {
  if (cost.runs.length === 0) {
    return (
      <Card>
        <CardHeader title="AI cost" />
        <p className="px-4 py-3 text-xs text-muted">
          Nothing generated yet, so nothing spent.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="AI cost"
        meta={`${cost.runs.length} run${cost.runs.length === 1 ? "" : "s"}`}
        action={
          <span className="text-sm font-semibold tabular-nums">
            {formatUsd(cost.totalUsd)}
          </span>
        }
      />

      {/*
        JSV2S1142 — the split the spend decision turns on, above the per-run
        detail. Two document lines would be a lie: one CVG call produces both
        the CV and the letter, so they cannot be costed apart without paying
        for the skill and master resume twice.
      */}
      <div className="grid grid-cols-3 gap-px border-b border-line bg-line">
        {cost.byBucket.map((bucket) => (
          <div key={bucket.key} className="bg-surface px-3 py-2">
            <p className="text-[10px] tracking-wide text-faint uppercase">
              {bucket.label}
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
              {formatUsd(bucket.usd)}
            </p>
            <p className="text-[10.5px] text-subtle">
              {bucket.runs} run{bucket.runs === 1 ? "" : "s"}
            </p>
            {/*
              The model, next to its own cost. "Is SimG worth Opus 5?" is not a
              question a total can answer — the price and the thing being paid
              for have to sit together.
            */}
            {bucket.models.length > 0 ? (
              <p className="truncate text-[10px] text-faint" title={bucket.models.join(", ")}>
                {bucket.models.join(", ")}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {cost.evaluationShare > 0 ? (
        <p className="border-b border-line px-4 py-2 text-[11.5px] text-muted">
          SimG is{" "}
          <span className="font-medium tabular-nums">
            {Math.round(cost.evaluationShare * 100)}%
          </span>{" "}
          of this application&rsquo;s spend. Turn it off with{" "}
          <code className="text-[11px]">SIMG_AUTOMATIC</code> in{" "}
          <code className="text-[11px]">config/simg.ts</code> if that is not
          buying enough.
        </p>
      ) : null}

      <ul className="divide-y divide-line">
        {cost.runs.map((run) => (
          <li key={run.id} className="px-4 py-2 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{run.taskLabel}</span>
              <span className="tabular-nums">
                {run.cost ? formatUsd(run.cost.totalCost) : "—"}
              </span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-2 text-subtle">
              <span className="truncate">{run.model ?? "unknown model"}</span>
              {run.cost ? (
                <span className="shrink-0 tabular-nums">
                  {compactTokens.format(run.cost.inputTokens)} in ·{" "}
                  {compactTokens.format(run.cost.outputTokens)} out
                  {run.cost.cacheCreationTokens + run.cost.cacheReadTokens > 0
                    ? ` · ${compactTokens.format(
                        run.cost.cacheCreationTokens + run.cost.cacheReadTokens,
                      )} cache`
                    : ""}
                </span>
              ) : null}
            </div>
            {run.cost && !run.cost.rated ? (
              <p className="mt-0.5 text-warning">
                No rate on file for this model — excluded from the total.
              </p>
            ) : null}
            {!run.cost ? (
              <p className="mt-0.5 text-subtle">
                The provider reported no token usage for this run.
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {cost.byModel.length > 1 ? (
        <div className="space-y-1 border-t border-line px-4 py-2 text-xs">
          {cost.byModel.map((m) => (
            <Row key={m.key} label={m.label} value={formatUsd(m.usd)} />
          ))}
        </div>
      ) : null}

      {cost.groundedRuns > 0 ? (
        <p className="border-t border-line px-4 py-2 text-[11px] text-subtle">
          {cost.groundedRuns} of this application&rsquo;s runs used Google Search
          grounding.{" "}
          {cost.groundingUsdBilled > 0
            ? // Past the allowance, so it is real money and is in the total above.
              `${formatUsd(cost.groundingUsdBilled)} of that is billed and included above.`
            : "Inside this month's free allowance, so it added nothing."}
        </p>
      ) : null}

      {grounding ? <GroundingMeter grounding={grounding} /> : null}
    </Card>
  );
}
