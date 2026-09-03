import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import csv from "papaparse";

import { mapDataset, type ApifyLinkedInJob } from "@/features/ingestion/sources/apify-linkedin";
import { prequalify } from "@/features/prequalification/engine";

/**
 * Calibration report, not a test (JSV2S1037).
 *
 *   npm run prequalify:calibrate
 *
 * Runs a real actor dataset through the gate and prints the distribution, so
 * the pass/review thresholds are set from measured behaviour rather than from
 * the guess they started as. Points at a file in ~/Downloads by default; no
 * database, no network, no spend.
 */
const PATH =
  process.env.DATASET ??
  `${process.env.HOME}/Downloads/dataset_linkedin-jobs-scraper_2026-09-03_17-30-23-358.csv`;

describe("pre-qualification calibration", () => {
  it("reports the verdict distribution over a real dataset", () => {
    const parsed = csv.parse<ApifyLinkedInJob>(readFileSync(PATH, "utf8").replace(/^﻿/, ""), {
      header: true,
      skipEmptyLines: true,
    });

    const { jobs, failures } = mapDataset(parsed.data);
    const counts: Record<string, number> = { pass: 0, review: 0, reject: 0 };
    const blamed: Record<string, number> = {};
    const scores: number[] = [];
    const passing: string[] = [];
    const reviewing: string[] = [];

    for (const job of jobs) {
      const v = prequalify({
        title: String(job.row.title),
        company: String(job.row.company),
        location: (job.row.location as string) ?? null,
        country: (job.row.country as string) ?? null,
        description: (job.row.description as string) ?? null,
      });
      counts[v.decision] += 1;
      scores.push(v.domain.score);
      if (v.decidedBy) blamed[v.decidedBy] = (blamed[v.decidedBy] ?? 0) + 1;
      if (v.decision === "pass") passing.push(`${v.domain.score.toFixed(1)}  ${job.row.title} — ${job.row.company}`);
      if (v.decision === "review") reviewing.push(`${v.decidedBy}  ${job.row.title} — ${job.row.company}`);
    }

    const n = jobs.length;
    const pc = (x: number) => `${((x / n) * 100).toFixed(0)}%`;

    console.log(`\n  Dataset: ${n} mapped, ${failures.length} unmappable\n`);
    console.log(`  PASS   ${String(counts.pass).padStart(3)}  ${pc(counts.pass)}`);
    console.log(`  REVIEW ${String(counts.review).padStart(3)}  ${pc(counts.review)}`);
    console.log(`  REJECT ${String(counts.reject).padStart(3)}  ${pc(counts.reject)}`);

    console.log("\n  Held back / rejected by:");
    for (const [k, v] of Object.entries(blamed).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${k.padEnd(12)} ${v}`);
    }

    const sorted = [...scores].sort((a, b) => a - b);
    const at = (p: number) => sorted[Math.floor(sorted.length * p)] ?? 0;
    console.log(
      `\n  Domain score: min ${sorted[0]?.toFixed(1)}  p50 ${at(0.5).toFixed(1)}  p75 ${at(0.75).toFixed(1)}  p90 ${at(0.9).toFixed(1)}  max ${sorted.at(-1)?.toFixed(1)}`,
    );

    console.log(`\n  Would be scored (${passing.length}), most relevant first:`);
    for (const p of passing.sort().reverse().slice(0, 15)) console.log(`    ${p}`);

    console.log(`\n  Would need review (${reviewing.length}), sample:`);
    for (const r of reviewing.slice(0, 10)) console.log(`    ${r}`);

    const est = counts.pass * 0.08;
    console.log(`\n  Estimated scoring cost for this batch: $${est.toFixed(2)}\n`);
  });
});
