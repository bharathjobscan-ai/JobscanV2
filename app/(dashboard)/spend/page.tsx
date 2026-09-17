import { Card, CardHeader, inputClass } from "@/components/ui/base";
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
 * Card layout, as asked. The headline numbers are the ones a decision turns on;
 * the split underneath is what makes them actionable, because a total alone
 * tells you nothing you can change.
 */

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
    <Card className="p-4">
      <p className="text-[10px] tracking-wide text-faint uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${colour}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-subtle">{hint}</p> : null}
    </Card>
  );
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Cost</h1>
          <p className="mt-0.5 text-xs text-muted">
            {from || to
              ? `${from ?? "the beginning"} to ${to ?? "today"}`
              : "Everything spent, all time"}
          </p>
        </div>

        {/* A plain GET form: the window lives in the URL, so a view is linkable
            and the back button works. */}
        <form method="get" action="/spend" className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-wide text-faint uppercase">From</span>
            <input type="date" name="from" defaultValue={from ?? ""} className={`${inputClass} w-36`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-wide text-faint uppercase">To</span>
            <input type="date" name="to" defaultValue={to ?? ""} className={`${inputClass} w-36`} />
          </label>
          <button
            type="submit"
            className="h-9 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90"
          >
            Apply
          </button>
          {from || to ? (
            <a href="/spend" className="h-9 px-2 text-xs leading-9 text-muted hover:text-foreground">
              All time
            </a>
          ) : null}
        </form>
      </div>

      {/* --- Headline ---------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total spent"
          value={formatUsd(spend.totalUsd)}
          hint={`${formatUsd(spend.aiUsd)} AI · ${formatUsd(spend.ingestionUsd)} fetch`}
        />
        <Stat
          label="Cost per application"
          value={perApp === null ? "—" : formatUsd(perApp)}
          hint={
            perApp === null
              ? "Nothing processed in this window"
              : `${spend.processedApplications} of ${spend.applications} processed · target $0.20`
          }
          tone={perAppTone}
        />
        <Stat
          label="Cost per job ingested"
          value={spend.costPerJobUsd === null ? "—" : formatUsd(spend.costPerJobUsd)}
          hint={`${spend.jobsIngested} job${spend.jobsIngested === 1 ? "" : "s"} seen`}
        />
        <Stat
          label="Runs"
          value={String(spend.aiRuns + spend.ingestionRuns)}
          hint={`${spend.aiRuns} AI · ${spend.ingestionRuns} fetch`}
        />
      </div>

      {/* --- The split ---------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Where it went"
          meta="A total tells you nothing you can change"
        />
        {spend.totalUsd === 0 ? (
          <p className="px-4 py-3 text-xs text-muted">Nothing spent in this window.</p>
        ) : (
          <ul className="divide-y divide-line">
            {spend.slices.map((slice) => (
              <li key={slice.key} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{slice.label}</span>
                  <span className="tabular-nums">{formatUsd(slice.usd)}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-surface-muted">
                  <div
                    className="h-1 rounded-full bg-accent"
                    style={{ width: `${Math.round(slice.share * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-subtle tabular-nums">
                  {Math.round(slice.share * 100)}% · {slice.runs} run
                  {slice.runs === 1 ? "" : "s"}
                  {slice.runs > 0 ? ` · ${formatUsd(slice.usd / slice.runs)} each` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* --- Caveats ------------------------------------------------------
          Stated rather than hidden: a cost figure that quietly excludes things
          is worse than one that says what it excludes. */}
      {spend.unratedRuns > 0 ||
      spend.unmeasuredRuns > 0 ||
      spend.groundedRuns > 0 ||
      spend.applications > spend.processedApplications ? (
        <Card>
          <CardHeader title="What these numbers do not include" />
          <ul className="space-y-1.5 px-4 py-3 text-xs text-muted">
            {spend.unmeasuredRuns > 0 ? (
              <li>
                <span className="font-medium text-foreground">
                  {spend.unmeasuredRuns} run
                  {spend.unmeasuredRuns === 1 ? "" : "s"}
                </span>{" "}
                reported no token usage, so their cost is unknowable — excluded
                rather than counted as free.
              </li>
            ) : null}
            {spend.unratedRuns > 0 ? (
              <li>
                <span className="font-medium text-warning">
                  {spend.unratedRuns} run{spend.unratedRuns === 1 ? "" : "s"}
                </span>{" "}
                used a model with no rate on file. Add it to{" "}
                <code className="text-[11px]">MODEL_RATES</code> rather than
                guessing.
              </li>
            ) : null}
            {spend.applications > spend.processedApplications ? (
              <li>
                <span className="font-medium text-foreground">
                  {spend.applications - spend.processedApplications} application
                  {spend.applications - spend.processedApplications === 1 ? "" : "s"}
                </span>{" "}
                have had no AI spent on them. Cost per application is divided by
                the {spend.processedApplications} that were actually processed —
                dividing by all of them would report{" "}
                {spend.costPerApplicationUsd === null
                  ? "—"
                  : formatUsd(spend.costPerApplicationUsd)}{" "}
                and flatter the figure.
              </li>
            ) : null}
            {spend.groundedRuns > 0 ? (
              <li>
                <span className="font-medium text-foreground">
                  {spend.groundedRuns} run{spend.groundedRuns === 1 ? "" : "s"}
                </span>{" "}
                used Google Search grounding. It bills per request against a
                shared 5,000 a month, so only those past the allowance are
                charged here — the rest genuinely cost nothing.
              </li>
            ) : null}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
