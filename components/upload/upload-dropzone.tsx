"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Badge } from "@/components/ui/base";
import { uploadJobsAction, type UploadState } from "@/features/ingestion/actions";
import { MAX_UPLOAD_ROWS } from "@/features/ingestion/schema";

const EMPTY: UploadState = {};

const ACCEPT = ".csv,.json,.xlsx,.xlsm";

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !ready}
      className="inline-flex min-h-9 items-center justify-center rounded-md border border-transparent bg-accent px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Processing…" : "Upload"}
    </button>
  );
}

/**
 * The upload drop zone (JSV2S1172).
 *
 * The file input is the real control and stays in the form — the drop zone
 * writes into it via `DataTransfer` rather than keeping a parallel copy of the
 * file, so the server action receives exactly what a plain file picker would
 * and nothing about the upload path changes when JavaScript is what moved the
 * file there.
 */
export function UploadDropzone() {
  const [state, action] = useActionState(uploadJobsAction, EMPTY);
  const inputRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const result = state.result;

  function adopt(files: FileList | null) {
    const input = inputRef.current;
    if (!input || !files || files.length === 0) return;
    const transfer = new DataTransfer();
    transfer.items.add(files[0]);
    input.files = transfer.files;
    setFilename(files[0].name);
  }

  return (
    <div>
      <form action={action}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            adopt(e.dataTransfer.files);
          }}
          className={`mt-[30px] rounded-lg border border-dashed px-[30px] py-[46px] text-center transition-colors ${
            dragging ? "border-accent bg-surface" : "border-line"
          }`}
        >
          <div className="n-display text-[22px] font-semibold">
            Drop a CSV, XLSX or JSON here
          </div>
          <div className="n-mono mt-1.5 text-[13px] text-muted">
            Up to {MAX_UPLOAD_ROWS} rows and 4 MB — about 340 rows of a LinkedIn export
          </div>

          <input
            ref={inputRef}
            type="file"
            name="file"
            accept={ACCEPT}
            /* No `required`: the input is visually hidden, and a browser
               refuses to report a validation message on a control it cannot
               focus — the submit would fail silently. The server action already
               rejects an empty upload, and Upload stays disabled until a file
               is chosen. */
            className="sr-only"
            onChange={(e) => setFilename(e.currentTarget.files?.[0]?.name ?? null)}
          />

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex min-h-9 items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-[13px] font-medium whitespace-nowrap transition-colors hover:bg-surface-muted"
            >
              Choose file
            </button>
            <SubmitButton ready={filename !== null} />
            <a
              href="/api/upload-template"
              className="inline-flex min-h-9 items-center justify-center px-3 text-[13px] whitespace-nowrap text-muted underline underline-offset-2 hover:text-foreground"
            >
              Download template
            </a>
          </div>

          <div className="n-mono mt-3 text-[12px] text-faint">
            {filename ?? "No file chosen"}
          </div>
        </div>
      </form>

      {state.error ? <p className="mt-3 text-[13px] text-negative">{state.error}</p> : null}

      {result ? (
        <section className="mt-9 border-t border-line">
          <div className="flex flex-wrap items-baseline justify-between gap-3 py-4">
            <h2 className="n-display text-[19px] font-semibold">Result</h2>
            <span className="n-mono text-[12px] text-faint">
              {result.total} row{result.total === 1 ? "" : "s"} read
            </span>
          </div>

          <div className="flex flex-wrap gap-2 pb-4">
            <Badge tone="positive">{result.inserted} inserted</Badge>
            <Badge tone="neutral">{result.duplicate} duplicate</Badge>
            <Badge tone={result.rejected > 0 ? "negative" : "neutral"}>
              {result.rejected} rejected
            </Badge>
            {result.screenedOut > 0 ? (
              <Badge tone="warning" title="Kept as jobs, but no application created — see Review">
                {result.screenedOut} screened out
              </Badge>
            ) : null}
            {result.incomplete > 0 ? (
              <Badge tone="warning">{result.incomplete} missing description</Badge>
            ) : null}
          </div>

          <ul className="text-[13px]">
            {result.rows.map((row) => (
              <li
                key={row.rowNumber}
                className="flex gap-3 border-t border-line px-1 py-2.5"
              >
                <span className="n-mono w-10 shrink-0 text-faint">#{row.rowNumber}</span>
                <span className="w-24 shrink-0">
                  <Badge
                    tone={
                      row.status === "inserted"
                        ? "positive"
                        : row.status === "duplicate"
                          ? "neutral"
                          : row.status === "screened_out"
                            ? "warning"
                            : "negative"
                    }
                  >
                    {row.status}
                  </Badge>
                </span>
                <span className="min-w-0 flex-1">
                  {row.title ? (
                    <span className="font-medium">
                      {row.title}
                      {row.company ? ` — ${row.company}` : ""}
                    </span>
                  ) : (
                    <span className="text-subtle">(no title)</span>
                  )}
                  {row.reason ? <span className="block text-muted">{row.reason}</span> : null}
                </span>
                {row.applicationId ? (
                  <a
                    href={`/applications/${row.applicationId}`}
                    className="shrink-0 text-muted underline underline-offset-2 hover:text-foreground"
                  >
                    Open
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
