import { formatUsd } from "@/lib/ai/pricing";
import type { BudgetStatus } from "@/features/ai/budget";
import type { ScoringPassResult } from "./orchestrator";

/**
 * The daily digest (JSV2S1042, 1043, 1045).
 *
 * Rendered as a GitHub Actions job summary rather than emailed. The scheduled
 * run already produces these numbers, Actions renders markdown on the run page,
 * and it emails on failure by itself — so the whole notification requirement is
 * met with no mail provider, no API key and no new dependency.
 *
 * Pure: takes results, returns markdown. No database, no filesystem, so the
 * shape of the report is unit-testable.
 */

export type IngestionSummary = {
  source: string;
  status: string;
  fetched: number;
  inserted: number;
  duplicates: number;
  screenedOut: number;
  rejected: number;
  errors: string[];
};

export type DigestInput = {
  date: Date;
  ingestion: IngestionSummary[];
  scoring: ScoringPassResult | null;
  /** Verdict counts across everything ingested this run. */
  prequalification?: Record<string, number>;
  topScores?: { title: string; company: string; score: number; preferredCity?: string | null }[];
};

function pct(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

function budgetLine(budget: BudgetStatus): string {
  const day = `${formatUsd(budget.day.spentUsd)} / ${formatUsd(budget.day.ceilingUsd)} today`;
  const month = `${formatUsd(budget.month.spentUsd)} / ${formatUsd(budget.month.ceilingUsd)} this month`;
  return budget.blocked ? `**${day}** · ${month} — **ceiling reached**` : `${day} · ${month}`;
}

export function renderDigest(input: DigestInput): string {
  const { ingestion, scoring } = input;
  const out: string[] = [];

  const fetched = ingestion.reduce((n, r) => n + r.fetched, 0);
  const inserted = ingestion.reduce((n, r) => n + r.inserted, 0);
  const screened = ingestion.reduce((n, r) => n + r.screenedOut, 0);
  const failures = ingestion.filter((r) => r.status === "failed" || r.status === "partial");

  out.push(`## JobScan — ${input.date.toISOString().slice(0, 10)}`);
  out.push("");

  // Headline first: what a person actually wants to know at a glance.
  if (scoring && scoring.scored > 0) {
    out.push(`**${scoring.scored} newly scored job${scoring.scored === 1 ? "" : "s"} waiting.**`);
  } else if (inserted > 0) {
    out.push(`**${inserted} new job${inserted === 1 ? "" : "s"} ingested, none scored.**`);
  } else {
    out.push("**Nothing new today.**");
  }
  out.push("");

  // --- Ingestion (JSV2S1012) ---------------------------------------------
  out.push("### Ingestion");
  out.push("");
  out.push("| Source | Status | Fetched | New | Duplicate | Screened out | Rejected |");
  out.push("|---|---|---:|---:|---:|---:|---:|");
  for (const run of ingestion) {
    out.push(
      `| ${run.source} | ${run.status} | ${run.fetched} | ${run.inserted} | ${run.duplicates} | ${run.screenedOut} | ${run.rejected} |`,
    );
  }
  if (ingestion.length === 0) out.push("| — | not run | 0 | 0 | 0 | 0 | 0 |");
  out.push("");

  if (fetched > 0) {
    out.push(
      `Pre-qualification screened out **${screened} of ${fetched}** fetched (${pct(screened, fetched)}).`,
    );
    out.push("");
  }

  // --- Source failures (JSV2S1045) ---------------------------------------
  //
  // Surfaced next to the numbers rather than in a log nobody opens: a partial
  // run that looks like a quiet day is the failure mode worth catching.
  if (failures.length > 0) {
    out.push("### ⚠️ Source failures");
    out.push("");
    for (const run of failures) {
      out.push(`- **${run.source}** — ${run.status}`);
      for (const error of run.errors.slice(0, 5)) out.push(`  - ${error}`);
      if (run.errors.length > 5) out.push(`  - …and ${run.errors.length - 5} more`);
    }
    out.push("");
  }

  // --- Pre-qualification --------------------------------------------------
  if (input.prequalification && Object.keys(input.prequalification).length > 0) {
    out.push("### Pre-qualification");
    out.push("");
    for (const [decision, n] of Object.entries(input.prequalification)) {
      out.push(`- ${decision}: **${n}**`);
    }
    out.push("");
  }

  // --- Scoring (JSV2S1136) ------------------------------------------------
  out.push("### Scoring");
  out.push("");
  if (!scoring) {
    out.push("Not run.");
  } else {
    out.push(
      `Eligible **${scoring.eligible}** · scored **${scoring.scored}** · failed **${scoring.failed}** · deferred **${scoring.deferred}**`,
    );
    out.push("");
    out.push(`AI spend: ${budgetLine(scoring.budget)}`);

    if (scoring.stoppedEarly) {
      out.push("");
      out.push(
        `> **Stopped early.** ${scoring.budget.reason} Deferred jobs keep their pre-qualification and are picked up by the next run — nothing is lost.`,
      );
    }

    const failedRuns = scoring.outcomes.filter((o) => o.status === "failed");
    if (failedRuns.length > 0) {
      out.push("");
      out.push("**Failed to score:**");
      for (const f of failedRuns.slice(0, 10)) {
        out.push(`- ${f.title} — ${f.company}: ${f.reason ?? "unknown error"}`);
      }
    }
  }
  out.push("");

  // --- What to look at ----------------------------------------------------
  if (input.topScores && input.topScores.length > 0) {
    out.push("### Worth a look");
    out.push("");
    out.push("| Score | Role | Company | |");
    out.push("|---:|---|---|---|");
    for (const job of input.topScores) {
      out.push(
        `| **${job.score}** | ${job.title} | ${job.company} | ${job.preferredCity ? `★ ${job.preferredCity}` : ""} |`,
      );
    }
    out.push("");
  }

  return out.join("\n");
}
