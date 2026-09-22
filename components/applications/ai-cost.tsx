import type { ApplicationCost } from "@/features/ai/queries";
import { formatUsd, GROUNDING_COST_PER_REQUEST } from "@/lib/ai/pricing";
import type { GroundingUsage } from "@/features/ai/grounding";
import { Panel, PanelGrid } from "@/components/applications/detail/section";

/**
 * JSV2S1132 — AI cost for one application, per run.
 *
 * Deliberately itemised rather than a single number: the point is to see which
 * task and which model the money went to, because that is the only actionable
 * form. A total alone tells you nothing you can change.
 *
 * Three panels (JSV2S1172): what it cost, where it went, and how close the
 * month is to the grounding cliff — the three questions asked here, in the
 * order they are asked.
 */

const compactTokens = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** A share of the total, as a hairline bar. Zero total means no bar to draw. */
function Bar({ ratio, tone = "var(--gold)" }: { ratio: number; tone?: string }) {
  return (
    <div className="mt-2 h-[3px] rounded-sm bg-surface-muted">
      <div
        className="h-[3px] rounded-sm"
        style={{ width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`, background: tone }}
      />
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
function GroundingPanel({ grounding }: { grounding: GroundingUsage }) {
  return (
    <Panel label="Search grounding">
      <p className="n-display mt-2 text-[30px] leading-none font-semibold tabular-nums">
        {grounding.used.toLocaleString()}
        <span className="text-[15px] text-faint"> / {grounding.free.toLocaleString()}</span>
      </p>

      <Bar
        ratio={grounding.ratio}
        tone={
          grounding.exhausted
            ? "var(--negative)"
            : grounding.warn
              ? "var(--warning)"
              : "var(--emerald)"
        }
      />

      <p className="mt-2.5 text-[12px] text-muted">
        {grounding.exhausted
          ? `Allowance spent. Each further grounded scoring run costs ${formatUsd(
              grounding.marginalUsd,
            )} — ${formatUsd(grounding.billableUsd)} billed so far this month.`
          : grounding.warn
            ? `${grounding.remaining.toLocaleString()} left. Past this, each grounded run costs ${formatUsd(
                GROUNDING_COST_PER_REQUEST,
              )} and the totals here start understating spend.`
            : `${grounding.remaining.toLocaleString()} left. Billed per request, not per token, so this is not in the totals here.`}
      </p>
    </Panel>
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
      <p className="text-[13.5px] text-muted">Nothing generated yet, so nothing spent.</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PanelGrid min="250px">
        <Panel label="This application">
          <p
            className="n-display mt-2 text-[44px] leading-none font-semibold tabular-nums"
            style={{ color: "var(--gold)" }}
          >
            {formatUsd(cost.totalUsd)}
          </p>
          <p className="mt-1.5 text-[12px] text-muted">
            {cost.runs.length} run{cost.runs.length === 1 ? "" : "s"}
            {cost.unratedRuns > 0
              ? ` · ${cost.unratedRuns} with no rate on file, excluded`
              : ""}
            {cost.unmeasuredRuns > 0
              ? ` · ${cost.unmeasuredRuns} reported no usage`
              : ""}
          </p>

          {cost.byModel.length > 0 ? (
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 border-t border-line pt-3 text-[12.5px] text-muted tabular-nums">
              {cost.byModel.map((m) => (
                <div key={m.key} className="contents">
                  <span className="truncate">{m.label}</span>
                  <span>{formatUsd(m.usd)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>

        {/*
          JSV2S1142 — the split the spend decision turns on. Two document lines
          would be a lie: one CVG call produces both the CV and the letter, so
          they cannot be costed apart without paying for the skill and master
          resume twice.
        */}
        <Panel label="Where it went">
          {cost.byBucket.map((bucket) => (
            <div
              key={bucket.key}
              className="border-b py-3 last:border-b-0"
              style={{ borderColor: "var(--hair)" }}
            >
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 truncate text-[13.5px]">{bucket.label}</span>
                <span className="n-display ml-auto text-[16px] whitespace-nowrap tabular-nums">
                  {formatUsd(bucket.usd)}
                </span>
              </div>
              <Bar ratio={cost.totalUsd > 0 ? bucket.usd / cost.totalUsd : 0} />
              {/*
                The model, next to its own cost. "Is SimG worth Opus 5?" is not
                a question a total can answer — the price and the thing being
                paid for have to sit together.
              */}
              <p
                className="mt-1.5 truncate text-[11px] text-faint tabular-nums"
                title={bucket.models.join(", ")}
              >
                {bucket.models.length > 0 ? bucket.models.join(", ") : "no model recorded"} ·{" "}
                {bucket.runs} run{bucket.runs === 1 ? "" : "s"}
              </p>
            </div>
          ))}

          {cost.evaluationShare > 0 ? (
            <p className="mt-3 text-[11.5px] text-muted">
              SimG is{" "}
              <span className="font-medium tabular-nums">
                {Math.round(cost.evaluationShare * 100)}%
              </span>{" "}
              of this application&rsquo;s spend. Turn it off with{" "}
              <code className="n-mono text-[11px]">SIMG_AUTOMATIC</code> in{" "}
              <code className="n-mono text-[11px]">config/simg.ts</code> if that is
              not buying enough.
            </p>
          ) : null}
        </Panel>

        {grounding ? (
          <GroundingPanel grounding={grounding} />
        ) : (
          <Panel label="Search grounding">
            <p className="mt-2 text-[12.5px] text-muted">
              {cost.groundedRuns > 0
                ? `${cost.groundedRuns} grounded run${cost.groundedRuns === 1 ? "" : "s"} on this application.`
                : "No run on this application used grounding."}
            </p>
          </Panel>
        )}
      </PanelGrid>

      <div>
        <p className="border-b border-line pb-2 text-[10px] tracking-[0.14em] text-faint uppercase">
          Every run
        </p>
        {cost.runs.map((run) => (
          <div
            key={run.id}
            className="border-b py-3"
            style={{ borderColor: "var(--hair)" }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13.5px]">{run.taskLabel}</span>
              <span className="n-mono text-[13px] tabular-nums">
                {run.cost ? formatUsd(run.cost.totalCost) : "—"}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-[11.5px] text-faint">
              <span className="truncate">{run.model ?? "unknown model"}</span>
              {run.cost ? (
                <span className="n-mono shrink-0 tabular-nums">
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
              <p className="mt-1 text-[11.5px] text-warning">
                No rate on file for this model — excluded from the total.
              </p>
            ) : null}
            {!run.cost ? (
              <p className="mt-1 text-[11.5px] text-subtle">
                The provider reported no token usage for this run.
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {cost.groundedRuns > 0 ? (
        <p className="text-[11.5px] text-subtle">
          {cost.groundedRuns} of this application&rsquo;s runs used Google Search
          grounding.{" "}
          {cost.groundingUsdBilled > 0
            ? // Past the allowance, so it is real money and is in the total above.
              `${formatUsd(cost.groundingUsdBilled)} of that is billed and included above.`
            : "Inside this month's free allowance, so it added nothing."}
        </p>
      ) : null}
    </div>
  );
}
