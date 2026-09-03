import { z } from "zod";

import { JOB_SOURCES, REACHABILITY_LEVELS } from "@/lib/config/constants";

/**
 * Must not exceed `serverActions.bodySizeLimit` in next.config.ts, which in turn
 * cannot exceed Vercel's 4.5 MB request-body cap. When these disagree the
 * larger one is a lie: Next rejects the request before this check ever runs,
 * and the user gets a 500 instead of the readable error below.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB
/**
 * A real Apify export runs ~12 KB per row, so 4 MB is reached at roughly 340
 * rows — bytes bind before this does. Kept as a guard against a pathological
 * file of tiny rows.
 */
export const MAX_UPLOAD_ROWS = 500;

/**
 * Canonical column names, plus tolerated aliases.
 *
 * Matching is case-insensitive and ignores spaces, hyphens and underscores, so
 * "Job Title", "job_title" and "jobtitle" all resolve to `title`.
 */
const HEADER_ALIASES: Record<string, string> = {
  jobtitle: "title",
  role: "title",
  position: "title",
  companyname: "company",
  employer: "company",
  joburl: "job_url",
  url: "job_url",
  link: "job_url",
  joblink: "job_url",
  applyurl: "external_apply_url",
  applicationurl: "external_apply_url",
  externalurl: "external_apply_url",
  jobdescription: "description",
  jd: "description",
  datePosted: "posted_at",
  posteddate: "posted_at",
  postingdate: "posted_at",
  jobid: "source_job_id",
  sourcejobid: "source_job_id",
  salary: "salary_raw",
  level: "seniority",
  contracttype: "employment_type",
  visasponsorship: "visa_sponsorship_mentioned",
  sponsorship: "visa_sponsorship_mentioned",
  leadsource: "inbound_source_detail",
  applyroute: "reachability",
  contactroute: "reachability",
};

function canonicalKey(key: string): string {
  const squashed = key.trim().toLowerCase().replace(/[\s\-_]+/g, "");
  return HEADER_ALIASES[squashed] ?? squashed.replace(/([a-z])([A-Z])/g, "$1_$2");
}

/** Map an arbitrary uploaded record onto canonical snake_case field names. */
export function normalizeHeaders(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!key) continue;
    const direct = key.trim().toLowerCase().replace(/[\s\-]+/g, "_");
    // Prefer an exact snake_case match, then fall back to the alias table.
    const target = CANONICAL_FIELDS.has(direct) ? direct : canonicalKey(key);
    if (out[target] === undefined || out[target] === "") out[target] = value;
  }
  return out;
}

const CANONICAL_FIELDS = new Set([
  "title",
  "company",
  "source",
  "job_url",
  "description",
  "location",
  "country",
  "external_apply_url",
  "posted_at",
  "employment_type",
  "seniority",
  "salary_raw",
  "visa_sponsorship_mentioned",
  "source_job_id",
  "inbound_source_detail",
  "reachability",
  "notes",
]);

// ---------------------------------------------------------------------------
// Coercion — deterministic, no guessing
// ---------------------------------------------------------------------------

/** Trim and collapse internal runs of whitespace. Empty becomes undefined. */
function cleanText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text === "" ? undefined : text;
}

/** Like cleanText but preserves newlines — job descriptions need paragraphs. */
function cleanLongText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text === "" ? undefined : text;
}

const TRUTHY = new Set(["true", "yes", "y", "1"]);
const FALSY = new Set(["false", "no", "n", "0"]);

function coerceBoolean(value: unknown): boolean | undefined | typeof INVALID {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (TRUTHY.has(text)) return true;
  if (FALSY.has(text)) return false;
  return INVALID;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const INVALID = Symbol("invalid");

/**
 * ISO `YYYY-MM-DD` only.
 *
 * We refuse to guess between DD/MM/YYYY and MM/DD/YYYY — silently picking one
 * would corrupt posting dates in a way nobody would notice until the Phase 3
 * time analysis looked wrong.
 *
 * Excel date cells arrive as JS Dates and are accepted directly.
 */
function coerceDate(value: unknown): string | undefined | typeof INVALID {
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (text === "") return undefined;
  if (!ISO_DATE.test(text)) return INVALID;
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return INVALID;
  return text;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Row schema
// ---------------------------------------------------------------------------

export const UploadRowSchema = z.object({
  title: z
    .string()
    .min(1, "title is required")
    .max(300, "title must be 300 characters or fewer"),
  company: z
    .string()
    .min(1, "company is required")
    .max(200, "company must be 200 characters or fewer"),
  source: z.enum(JOB_SOURCES, {
    message: `source must be one of: ${JOB_SOURCES.join(", ")}`,
  }),
  job_url: z
    .string()
    .min(1, "job_url is required")
    .refine(isHttpUrl, "job_url must be a valid http(s) URL"),

  description: z.string().optional(),
  location: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  external_apply_url: z
    .string()
    .refine(isHttpUrl, "external_apply_url must be a valid http(s) URL")
    .optional(),
  posted_at: z.string().regex(ISO_DATE).optional(),
  employment_type: z.string().max(100).optional(),
  seniority: z.string().max(100).optional(),
  salary_raw: z.string().max(200).optional(),
  visa_sponsorship_mentioned: z.boolean().optional(),
  source_job_id: z.string().max(200).optional(),
  inbound_source_detail: z.string().max(300).optional(),
  reachability: z
    .enum(REACHABILITY_LEVELS, {
      message: `reachability must be one of: ${REACHABILITY_LEVELS.join(", ")}`,
    })
    .optional(),
  notes: z.string().max(2000).optional(),
});

export type UploadRow = z.infer<typeof UploadRowSchema>;

export type RowError = { field: string; message: string };

export type RowParseResult =
  | { ok: true; value: UploadRow; raw: Record<string, unknown> }
  | { ok: false; errors: RowError[]; raw: Record<string, unknown> };

/**
 * Coerce then validate a single uploaded record.
 *
 * Row-level failure isolation (JSV2S1033): this never throws. A bad row comes
 * back as `ok: false` with reasons and the batch carries on.
 */
export function parseUploadRow(input: Record<string, unknown>): RowParseResult {
  const raw = { ...input };
  const row = normalizeHeaders(input);
  const errors: RowError[] = [];

  const boolValue = coerceBoolean(row.visa_sponsorship_mentioned);
  if (boolValue === INVALID) {
    errors.push({
      field: "visa_sponsorship_mentioned",
      message: "expected one of: true, false, yes, no, y, n, 1, 0",
    });
  }

  const dateValue = coerceDate(row.posted_at);
  if (dateValue === INVALID) {
    errors.push({
      field: "posted_at",
      message: "expected ISO format YYYY-MM-DD (ambiguous formats are rejected)",
    });
  }

  const candidate = {
    title: cleanText(row.title),
    company: cleanText(row.company),
    source: cleanText(row.source)?.toLowerCase(),
    job_url: cleanText(row.job_url),
    description: cleanLongText(row.description),
    location: cleanText(row.location),
    country: cleanText(row.country),
    external_apply_url: cleanText(row.external_apply_url),
    posted_at: dateValue === INVALID ? undefined : dateValue,
    employment_type: cleanText(row.employment_type),
    seniority: cleanText(row.seniority),
    salary_raw: cleanText(row.salary_raw),
    visa_sponsorship_mentioned: boolValue === INVALID ? undefined : boolValue,
    source_job_id: cleanText(row.source_job_id),
    inbound_source_detail: cleanText(row.inbound_source_detail),
    reachability: cleanText(row.reachability)?.toLowerCase().replace(/[\s-]+/g, "_"),
    notes: cleanText(row.notes),
  };

  const parsed = UploadRowSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({
        field: String(issue.path[0] ?? "row"),
        message: issue.message,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors, raw };
  return { ok: true, value: parsed.data!, raw };
}

/**
 * A job with no description is accepted but cannot be scored or tailored —
 * ScoreG and CVG both need the JD text. The workspace surfaces this as
 * "Incomplete" and disables generation until it is filled in.
 */
export function isIncomplete(row: { description?: string | null }): boolean {
  return !row.description || row.description.trim().length < 50;
}
