"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Badge, Button, Card, CardHeader } from "@/components/ui/base";
import { uploadJobsAction, type UploadState } from "@/features/ingestion/actions";

const EMPTY: UploadState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Processing…" : "Upload"}
    </Button>
  );
}

export function UploadForm() {
  const [state, action] = useActionState(uploadJobsAction, EMPTY);
  const result = state.result;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Upload jobs" meta="CSV · XLSX · JSON" />
        <form action={action} className="flex flex-col gap-3 p-4">
          <input
            type="file"
            name="file"
            accept=".csv,.json,.xlsx,.xlsm"
            required
            className="text-xs file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-2.5 file:py-1.5 file:text-xs file:font-medium"
          />
          <div className="flex items-center gap-3">
            <SubmitButton />
            <a
              href="/api/upload-template"
              className="text-xs text-muted underline underline-offset-2 hover:text-foreground"
            >
              Download template
            </a>
          </div>
          {state.error ? <p className="text-xs text-negative">{state.error}</p> : null}
        </form>
      </Card>

      {result ? (
        <Card>
          <CardHeader
            title="Result"
            meta={`${result.total} row${result.total === 1 ? "" : "s"} read`}
          />
          <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
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

          <ul className="divide-y divide-line text-xs">
            {result.rows.map((row) => (
              <li key={row.rowNumber} className="flex gap-3 px-4 py-2">
                <span className="w-10 shrink-0 text-subtle">#{row.rowNumber}</span>
                <span className="w-20 shrink-0">
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
                  {row.reason ? (
                    <span className="block text-muted">{row.reason}</span>
                  ) : null}
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
        </Card>
      ) : null}
    </div>
  );
}
