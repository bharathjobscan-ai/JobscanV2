"use client";

import { useState } from "react";

/**
 * Bulk selection for the Bin (JSV2S1157).
 *
 * Wraps the list in a real `<form>`, so every row's checkbox posts its `jobId`
 * and the same server action serves one job or fifty — the difference is how
 * many boxes are ticked, not which endpoint is called.
 *
 * Selection state is read from the form itself rather than mirrored in React.
 * Duplicating it would mean two sources of truth for what is ticked, and the
 * one that submits is the DOM.
 */
export function BinSelection({
  action,
  children,
  label = "Move to Bin",
}: {
  action: (data: FormData) => void | Promise<void>;
  children: React.ReactNode;
  label?: string;
}) {
  const [count, setCount] = useState(0);

  function recount(form: HTMLFormElement | null) {
    if (!form) return;
    setCount(
      form.querySelectorAll<HTMLInputElement>('input[name="jobId"]:checked').length,
    );
  }

  return (
    <form
      action={action}
      onChange={(e) => recount(e.currentTarget)}
      onReset={() => setCount(0)}
    >
      <div className="mb-2 flex items-center gap-3 text-xs">
        <label className="flex cursor-pointer items-center gap-2 text-muted hover:text-foreground">
          <input
            type="checkbox"
            className="size-3.5"
            onChange={(e) => {
              const form = e.currentTarget.form;
              if (!form) return;
              for (const box of form.querySelectorAll<HTMLInputElement>(
                'input[name="jobId"]',
              )) {
                box.checked = e.currentTarget.checked;
              }
              recount(form);
            }}
          />
          Select all on this page
        </label>

        {count > 0 ? (
          <>
            <span className="tabular-nums text-muted">{count} selected</span>
            <button
              type="submit"
              className="rounded-md border border-line-strong px-2.5 py-1 font-medium hover:bg-surface-muted"
            >
              {label}
            </button>
            <button type="reset" className="text-muted hover:text-foreground">
              Clear
            </button>
          </>
        ) : (
          <span className="text-faint">
            Tick a job to dismiss it. Binned jobs keep their verdict and stay in
            the database.
          </span>
        )}
      </div>

      {children}
    </form>
  );
}
