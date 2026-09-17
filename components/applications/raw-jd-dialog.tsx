"use client";

import { useRef } from "react";

import { Badge, Button } from "@/components/ui/base";
import { highlightTerms, termFrequency } from "@/features/prequalification/highlight";

/**
 * "View Raw JD" — the posting as ingested, with the domain terms the
 * pre-qualification gate matched highlighted in place (JSV2S1152).
 *
 * The value is auditability: the gate decides whether a job is worth spending
 * money on, and this is where you can see *why* it decided that, against the
 * actual words in the posting rather than a score.
 *
 * A native `<dialog>` rather than a library — it gives focus trapping, Escape
 * to close and the backdrop for free.
 */
export function RawJdDialog({
  description,
  matchedTerms,
  title,
  company,
}: {
  description: string | null;
  matchedTerms: string[];
  title: string;
  company: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  if (!description) return null;

  const segments = highlightTerms(description, matchedTerms);
  const frequencies = termFrequency(segments);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => ref.current?.showModal()}>
        View Raw JD
      </Button>

      <dialog
        ref={ref}
        className="m-auto w-[min(56rem,92vw)] rounded-lg border border-line bg-surface p-0 text-foreground backdrop:bg-black/50"
        onClick={(event) => {
          // Click outside the panel closes it; clicks inside must not.
          if (event.target === ref.current) ref.current?.close();
        }}
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            <p className="truncate text-xs text-muted">{company}</p>
          </div>
          <Button type="button" variant="ghost" onClick={() => ref.current?.close()}>
            Close
          </Button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
          {frequencies.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-line pb-3">
              <span className="mr-1 text-[11px] text-subtle">
                Domain terms matched by the gate:
              </span>
              {frequencies.map(({ term, count }) => (
                <Badge key={term} tone="positive">
                  {term}
                  {count > 1 ? ` ×${count}` : ""}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mb-3 border-b border-line pb-3 text-xs text-warning">
              No domain terms matched. This posting reached scoring on the other
              filters, or was uploaded manually.
            </p>
          )}

          {/* `whitespace-pre-wrap` keeps the posting's own paragraphing, which
              is often the only structure a scraped description has. */}
          <p className="text-xs leading-relaxed whitespace-pre-wrap">
            {segments.map((segment, i) =>
              segment.term ? (
                <mark
                  key={i}
                  title={`Matched domain term: ${segment.term}`}
                  className="rounded-sm bg-positive-bg px-0.5 font-medium text-positive"
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={i}>{segment.text}</span>
              ),
            )}
          </p>
        </div>
      </dialog>
    </>
  );
}
