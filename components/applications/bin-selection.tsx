"use client";

import { useState } from "react";

/**
 * Bulk selection for the Bin (JSV2S1157).
 *
 * The form is a SIBLING of the list, not a wrapper. Each row's checkbox joins
 * it by `form="bin-form"` instead of by nesting.
 *
 * That is not stylistic. Every row already contains its own promote and reject
 * forms, and a `<form>` cannot contain another `<form>` — the browser silently
 * drops the inner ones, which broke promote and reject the moment the list was
 * wrapped. The `form` attribute associates an input with a form anywhere in the
 * document, which is exactly the case it exists for.
 *
 * Selection state is read from the DOM rather than mirrored in React:
 * duplicating it would create two sources of truth for what is ticked, and the
 * one that actually submits is the DOM.
 */
export const BIN_FORM_ID = "bin-form";

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

  /**
   * `form.elements`, not `form.querySelectorAll`.
   *
   * The checkboxes are associated with the form by `form="bin-form"` rather
   * than nested inside it, so a descendant query finds nothing. `elements` is
   * the collection that follows the association.
   */
  function boxes(form: HTMLFormElement | null): HTMLInputElement[] {
    if (!form) return [];
    return [...form.elements].filter(
      (el): el is HTMLInputElement =>
        el instanceof HTMLInputElement && el.name === "jobId",
    );
  }

  function recount(form: HTMLFormElement | null) {
    setCount(boxes(form).filter((b) => b.checked).length);
  }

  return (
    <>
      <form
        id={BIN_FORM_ID}
        action={action}
        onChange={(e) => recount(e.currentTarget)}
        onReset={() => setCount(0)}
      />

      <div className="mb-2 flex items-center gap-3 text-xs">
        <label className="flex cursor-pointer items-center gap-2 text-muted hover:text-foreground">
          <input
            type="checkbox"
            form={BIN_FORM_ID}
            className="size-3.5"
            onChange={(e) => {
              const form = e.currentTarget.form;
              if (!form) return;
              for (const box of boxes(form)) box.checked = e.currentTarget.checked;
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
              form={BIN_FORM_ID}
              className="rounded-md border border-line-strong px-2.5 py-1 font-medium hover:bg-surface-muted"
            >
              {label}
            </button>
            <button
              type="reset"
              form={BIN_FORM_ID}
              className="text-muted hover:text-foreground"
            >
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
    </>
  );
}
