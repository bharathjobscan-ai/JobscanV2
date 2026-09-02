#!/usr/bin/env node
/**
 * Per-job token usage and cost, measured from real runs.
 *
 *   npm run ai:report
 *
 * On the Pro subscription no money changes hands. These figures answer "what
 * would this cost on the metered API", and act as a proxy for how hard each run
 * draws on the subscription allowance.
 */
import process from "node:process";
import postgres from "postgres";

import { computeCost, formatUsd, MODEL_RATES } from "../lib/ai/pricing.ts";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* already exported */
}

const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL or DATABASE_URL must be set.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

const TASK_LABEL = {
  score: "Job Score",
  tailor_cv: "Resume (incl. Pass G)",
  cover_letter: "Cover Letter",
};

const rows = await sql`
  select j.task_type, j.model, j.provider, j.usage, j.finished_at,
         r.title, r.company
    from ai_jobs j
    join applications a on a.id = j.application_id
    join raw_jobs r on r.id = a.raw_job_id
   where j.status = 'succeeded' and j.usage is not null
   order by j.finished_at
`;

if (rows.length === 0) {
  console.log("\nNo measured runs yet.\n");
  console.log("Usage is recorded only for real Claude runs (AI_PROVIDER=claude_local).");
  console.log("Mock runs consume nothing and are not counted.\n");
  await sql.end();
  process.exit(0);
}

console.log(`\nMeasured runs: ${rows.length}\n`);
console.log(
  "TASK".padEnd(24) +
    "MODEL".padEnd(18) +
    "IN".padStart(9) +
    "OUT".padStart(9) +
    "CACHE".padStart(9) +
    "COST".padStart(11),
);
console.log("-".repeat(80));

const byTask = new Map();

for (const row of rows) {
  const usage = row.usage;
  const cost = computeCost(row.model, usage);
  const label = TASK_LABEL[row.task_type] ?? row.task_type;

  console.log(
    label.padEnd(24) +
      String(row.model ?? "-").padEnd(18) +
      String(cost.inputTokens).padStart(9) +
      String(cost.outputTokens).padStart(9) +
      String(cost.cacheReadTokens + cost.cacheCreationTokens).padStart(9) +
      (cost.rated ? formatUsd(cost.totalCost) : "unrated").padStart(11),
  );

  const key = row.task_type;
  const acc = byTask.get(key) ?? { n: 0, cost: 0, input: 0, output: 0, model: row.model };
  acc.n += 1;
  acc.cost += cost.totalCost;
  acc.input += cost.inputTokens + cost.cacheReadTokens + cost.cacheCreationTokens;
  acc.output += cost.outputTokens;
  byTask.set(key, acc);
}

console.log("\n\nAVERAGE PER JOB\n");
console.log(
  "TASK".padEnd(24) + "RUNS".padStart(6) + "IN".padStart(10) + "OUT".padStart(10) + "COST".padStart(11),
);
console.log("-".repeat(61));

const avg = {};
for (const [task, acc] of byTask) {
  const label = TASK_LABEL[task] ?? task;
  avg[task] = acc.cost / acc.n;
  console.log(
    label.padEnd(24) +
      String(acc.n).padStart(6) +
      Math.round(acc.input / acc.n).toLocaleString().padStart(10) +
      Math.round(acc.output / acc.n).toLocaleString().padStart(10) +
      formatUsd(acc.cost / acc.n).padStart(11),
  );
}

// A "package" is everything one application needs: score + resume + cover letter.
const perScore = avg.score ?? 0;
const perPackage = (avg.tailor_cv ?? 0) + (avg.cover_letter ?? 0);
const perApplication = perScore + perPackage;

if (perApplication > 0) {
  console.log(`\nOne fully processed application: ${formatUsd(perApplication)}`);
  console.log("  (score + tailored resume + cover letter)\n");

  console.log("PROJECTED, if run on the metered API\n");
  console.log("CADENCE".padEnd(34) + "COST".padStart(11));
  console.log("-".repeat(45));

  for (const [label, scores, packages, days] of [
    ["Daily — 10 scores + 2 packages", 10, 2, 1],
    ["Weekly — 70 scores + 14 packages", 70, 14, 7],
    ["Monthly — 300 scores + 60 packages", 300, 60, 30],
  ]) {
    const total = perScore * scores + perPackage * packages;
    console.log(label.padEnd(34) + formatUsd(total).padStart(11));
    void days;
  }
  console.log();
}

const models = [...new Set(rows.map((r) => r.model))].filter((m) => !MODEL_RATES[m]);
if (models.length) {
  console.log(`Unrated models (cost shown as 0): ${models.join(", ")}`);
  console.log("Add them to MODEL_RATES in lib/ai/pricing.ts.\n");
}

console.log("Rates are metered-API list prices. On Claude Pro nothing is charged;");
console.log("these figures indicate subscription draw and the cost if you switch.\n");

await sql.end();
