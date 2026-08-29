import { UploadForm } from "@/components/ingestion/upload-form";
import { Card, CardHeader } from "@/components/ui/base";
import { JOB_SOURCES, REACHABILITY_LABELS, REACHABILITY_LEVELS } from "@/lib/config/constants";
import { MAX_UPLOAD_ROWS } from "@/features/ingestion/schema";

export default function UploadPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Upload jobs</h1>
        <p className="text-xs text-muted">
          Every valid row becomes an application ready to work. Re-uploading the
          same file is safe — duplicates are detected, not inserted again.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <UploadForm />

        <Card className="h-fit">
          <CardHeader title="Field reference" />
          <div className="flex flex-col gap-3 p-4 text-xs">
            <div>
              <h3 className="mb-1 font-semibold">Required</h3>
              <ul className="list-disc pl-4 text-muted">
                <li>
                  <code className="font-mono">title</code>
                </li>
                <li>
                  <code className="font-mono">company</code>
                </li>
                <li>
                  <code className="font-mono">source</code>
                </li>
                <li>
                  <code className="font-mono">job_url</code> — http(s)
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">Needed to generate</h3>
              <p className="text-muted">
                <code className="font-mono">description</code> — a row without it
                still imports, but scoring and CV tailoring stay disabled until
                you paste it in.
              </p>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">Optional</h3>
              <p className="text-muted">
                location, country, external_apply_url, posted_at, employment_type,
                seniority, salary_raw, visa_sponsorship_mentioned, source_job_id,
                inbound_source_detail, reachability, notes
              </p>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">Rules</h3>
              <ul className="list-disc pl-4 text-muted">
                <li>
                  Dates must be <code className="font-mono">YYYY-MM-DD</code>.
                  Ambiguous formats are rejected rather than guessed.
                </li>
                <li>Booleans: true/false, yes/no, y/n, 1/0.</li>
                <li>A bad row is rejected on its own; the rest still import.</li>
                <li>Max {MAX_UPLOAD_ROWS} rows and 5 MB per upload.</li>
                <li>
                  <code className="font-mono">posted_at</code> drives the posting-age
                  score — supply it, or that rule is forfeited.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">Reachability</h3>
              <p className="mb-1 text-muted">
                How you can reach a human about this role. Scoring uses it
                directly — leaving it blank forfeits up to 15 points.
              </p>
              <ul className="list-disc pl-4 text-muted">
                {REACHABILITY_LEVELS.map((level) => (
                  <li key={level}>
                    <code className="font-mono">{level}</code> —{" "}
                    {REACHABILITY_LABELS[level]}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-1 font-semibold">Sources</h3>
              <p className="font-mono text-[11px] text-muted">
                {JOB_SOURCES.join(" · ")}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
