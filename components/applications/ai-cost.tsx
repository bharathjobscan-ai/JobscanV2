import type { ApplicationCost } from "@/features/ai/queries";
import { formatUsd } from "@/lib/ai/pricing";
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

export function AiCostCard({ cost }: { cost: ApplicationCost }) {
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
          {cost.groundedRuns} run{cost.groundedRuns === 1 ? "" : "s"} used Google
          Search grounding, billed separately at{" "}
          {formatUsd(cost.groundingUsdIfBillable)} once the free 5,000 requests a
          month are used up. Not included above.
        </p>
      ) : null}
    </Card>
  );
}
