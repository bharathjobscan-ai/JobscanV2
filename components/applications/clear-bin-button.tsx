"use client";

import { useState, useTransition } from "react";

import { clearBinAction } from "@/features/prequalification/actions";

/**
 * Empty the Bin of everything past its 30 days (2026-09-24).
 *
 * Two steps, because it deletes every eligible row at once, including any
 * discarded application with its documents, and nothing can bring them back.
 * The ticked-rows delete beside it is narrower: you choose each row.
 */
export function ClearBinButton({ count, days }: { count: number; days: number }) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (count === 0) return null;

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
        style={{ borderColor: "var(--negative)", color: "var(--negative)" }}
      >
        Clear {count} older than {days} days
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-negative">
        Permanently delete {count} job{count === 1 ? "" : "s"} and any discarded
        applications with them? This cannot be undone.
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          await clearBinAction();
          setArmed(false);
        })}
        className="rounded-md px-2.5 py-1 font-medium text-white disabled:opacity-40"
        style={{ background: "var(--negative)" }}
      >
        {pending ? "Deleting…" : "Delete permanently"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setArmed(false)}
        className="text-muted hover:text-foreground"
      >
        Cancel
      </button>
    </span>
  );
}
