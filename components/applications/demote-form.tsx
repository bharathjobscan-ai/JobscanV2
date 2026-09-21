"use client";

import { useState, useTransition } from "react";

import { demoteApplicationAction } from "@/features/prequalification/actions";

/**
 * Send an application back to a pile (2026-09-21).
 *
 * The inverse of promoting from the review queue. Deliberately at the FOOT of
 * the page rather than beside the score: it is reached rarely, it destroys an
 * application row, and putting a destructive action next to the thing you read
 * most is how it gets clicked by accident.
 *
 * Client-side because the refusal has to be shown in place. An application that
 * already carries a generated CV cannot be sent back without deleting work that
 * cost real money, and "here is why not" belongs next to the button rather than
 * on an error page.
 */
export function DemoteForm({ applicationId }: { applicationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send(to: "review" | "reject") {
    setError(null);
    const data = new FormData();
    data.set("applicationId", applicationId);
    data.set("to", to);
    startTransition(async () => {
      const result = await demoteApplicationAction(data);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => send("review")}
          className="rounded-md border border-line-strong px-2.5 py-1.5 text-xs font-medium hover:bg-surface-muted disabled:opacity-40"
        >
          Send back to review
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => send("reject")}
          className="rounded-md border border-line-strong px-2.5 py-1.5 text-xs font-medium text-negative hover:bg-negative-bg disabled:opacity-40"
        >
          Discard
        </button>
        <span className="text-[11px] text-faint">
          Removes the application; the job keeps its row and verdict.
        </span>
      </div>

      {error ? (
        <p className="rounded-md border border-line bg-warning-bg px-2.5 py-2 text-[11px] text-warning">
          {error}
        </p>
      ) : null}
    </div>
  );
}
