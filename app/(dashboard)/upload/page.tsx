import { UploadDropzone } from "@/components/upload/upload-dropzone";
import { MAX_UPLOAD_ROWS } from "@/features/ingestion/schema";
import { JOB_SOURCES, REACHABILITY_LABELS, REACHABILITY_LEVELS } from "@/lib/config/constants";

/**
 * The field reference, as disclosure rows rather than a permanent sidebar
 * (JSV2S1172).
 *
 * Every column of it was on screen at all times next to the one control that
 * matters; folded away, the page is the drop zone and the reference is one
 * click from it.
 */
function FieldFold({
  label,
  meta,
  children,
}: {
  label: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <details className="border-b border-line">
      <summary className="flex cursor-pointer items-baseline justify-between gap-4 px-1 py-4 [&::-webkit-details-marker]:hidden">
        <span className="text-[15px]">{label}</span>
        <span className="n-mono text-[12px] whitespace-nowrap text-faint">{meta}</span>
      </summary>
      <div className="max-w-[74ch] px-1 pb-[18px] text-[13.5px] text-muted">{children}</div>
    </details>
  );
}

export default function UploadPage() {
  return (
    <div>
      <h1 className="n-display text-[38px] leading-none font-normal tracking-[-0.02em]">
        Upload jobs
      </h1>
      <p className="mt-1.5 max-w-[64ch] text-sm text-muted">
        Every valid row becomes an application ready to work. Re-uploading the same
        file is safe — duplicates are detected, not inserted again.
      </p>

      <UploadDropzone />

      <div className="mt-9 border-t border-line">
        <FieldFold label="Required columns" meta="4 fields">
          <span className="n-mono">title · company · source · job_url</span> (must be
          http or https). A row missing any of these is rejected on its own; the rest
          of the file still imports.
        </FieldFold>

        <FieldFold label="Needed to generate" meta="1 field">
          <span className="n-mono">description</span> — a row without it still
          imports, but scoring and CV tailoring stay disabled until you paste it in.
        </FieldFold>

        <FieldFold label="Optional columns" meta="12 fields">
          <span className="n-mono">
            location · country · external_apply_url · posted_at · employment_type ·
            seniority · salary_raw · visa_sponsorship_mentioned · source_job_id ·
            inbound_source_detail · reachability · notes
          </span>
          . <span className="n-mono">posted_at</span> drives the posting-age score —
          supply it, or that rule is forfeited.
        </FieldFold>

        <FieldFold label="Parsing rules" meta="strict by design">
          Dates must be <span className="n-mono">YYYY-MM-DD</span>; ambiguous formats
          are rejected rather than guessed. Booleans accept true/false, yes/no, y/n,
          1/0. A bad row is rejected on its own; the rest still import. Max{" "}
          {MAX_UPLOAD_ROWS} rows and 4 MB per upload — larger backfills need to be
          split by city; the 4 MB ceiling is Vercel&rsquo;s, not ours.
        </FieldFold>

        <FieldFold label="Reachability values" meta="scores up to 15">
          <p className="mb-2">
            How you can reach a human about this role. Scoring uses it directly —
            leaving it blank forfeits up to 15 points.
          </p>
          <ul className="list-disc pl-4">
            {REACHABILITY_LEVELS.map((level) => (
              <li key={level}>
                <span className="n-mono">{level}</span> — {REACHABILITY_LABELS[level]}
              </li>
            ))}
          </ul>
        </FieldFold>

        <FieldFold label="Sources" meta={`${JOB_SOURCES.length} values`}>
          <span className="n-mono">{JOB_SOURCES.join(" · ")}</span>
        </FieldFold>
      </div>
    </div>
  );
}
