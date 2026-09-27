import Link from "next/link";

import {
  MAX_CUSTOM_RANGE_MONTHS,
  RUN_RANGES,
  RUN_RANGE_LABELS,
  type RunRange,
} from "@/features/ingestion/run-outcomes";

/**
 * The run-history controls (2026-09-24).
 *
 * Every piece of state is a URL parameter and every control is a link or a GET
 * form, so a view is linkable, the back button works, and the page stays a
 * server component — a filter bar is not worth shipping a client bundle for.
 */

export type RunFilterState = {
  range: RunRange | null;
  from: string | null;
  to: string | null;
  page: number;
};

export function runsHref({ range, from, to, page }: Partial<RunFilterState>): string {
  const q = new URLSearchParams({ runs: "all" });
  if (range) q.set("range", range);
  if (range === "custom") {
    if (from) q.set("from", from);
    if (to) q.set("to", to);
  }
  // Page 1 is the default; carrying it would only make links longer.
  if (page && page > 1) q.set("page", String(page));
  return `/pipeline?${q.toString()}`;
}

function Chip({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full px-3 py-1 text-[12.5px] whitespace-nowrap transition-colors ${
        active ? "bg-surface text-foreground" : "text-muted hover:text-foreground"
      }`}
      style={active ? { border: "1px solid var(--gold)" } : { border: "1px solid var(--hair)" }}
    >
      {children}
    </Link>
  );
}

export function RunFilters({
  state,
  clampedTo,
}: {
  state: RunFilterState;
  clampedTo: string | null;
}) {
  return (
    <div className="mt-3.5 rounded-[7px] bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip href={runsHref({})} active={state.range === null}>
          All
        </Chip>
        {RUN_RANGES.filter((r) => r !== "custom").map((r) => (
          <Chip key={r} href={runsHref({ range: r })} active={state.range === r}>
            {RUN_RANGE_LABELS[r]}
          </Chip>
        ))}

        <form method="get" action="/pipeline" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="runs" value="all" />
          <input type="hidden" name="range" value="custom" />
          <label className="n-mono text-[11.5px] text-subtle" htmlFor="run-from">
            From
          </label>
          <input
            id="run-from"
            type="date"
            name="from"
            defaultValue={state.from ?? ""}
            className="n-mono rounded border border-line bg-transparent px-2 py-1 text-[12px]"
          />
          <label className="n-mono text-[11.5px] text-subtle" htmlFor="run-to">
            to
          </label>
          <input
            id="run-to"
            type="date"
            name="to"
            defaultValue={state.to ?? ""}
            className="n-mono rounded border border-line bg-transparent px-2 py-1 text-[12px]"
          />
          <button
            type="submit"
            className="rounded-full px-3 py-1 text-[12.5px] text-muted hover:text-foreground"
            style={{
              border: `1px solid ${state.range === "custom" ? "var(--gold)" : "var(--hair)"}`,
            }}
          >
            Apply
          </button>
        </form>
      </div>

      <p className="n-mono mt-3 text-[11.5px] text-subtle">
        A custom range may span at most {MAX_CUSTOM_RANGE_MONTHS} months.
      </p>
      {clampedTo ? (
        <p className="mt-1 text-[12.5px] text-warning">
          That range was wider than {MAX_CUSTOM_RANGE_MONTHS} months, so it ends at{" "}
          {clampedTo}. Narrow the start date to see anything later.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Page controls.
 *
 * Shown even on a single page: the count is the honest answer to "is this all
 * of them", and a control that vanishes makes that ambiguous.
 */
export function RunPager({
  state,
  page,
  totalPages,
  total,
}: {
  state: RunFilterState;
  page: number;
  totalPages: number;
  total: number;
}) {
  const step = (to: number) => runsHref({ ...state, page: to });
  const linkClass = "text-[12.5px] underline decoration-dotted underline-offset-2";
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <span className="n-mono text-[12.5px] text-subtle">
        Page {page} of {totalPages} · {total} run{total === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-4">
        {page > 1 ? (
          <Link href={step(page - 1)} className={linkClass}>
            Previous
          </Link>
        ) : (
          <span className="text-[12.5px] text-subtle">Previous</span>
        )}
        {page < totalPages ? (
          <Link href={step(page + 1)} className={linkClass}>
            Next
          </Link>
        ) : (
          <span className="text-[12.5px] text-subtle">Next</span>
        )}
      </div>
    </div>
  );
}
