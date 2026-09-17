"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DateRangePicker } from "@/components/ui/date-range";
import type {
  FilterSelections,
  ReviewFacets,
} from "@/features/prequalification/queries";
import {
  PREQUAL_FILTERS,
  PREQUAL_FILTER_LABELS,
  type PrequalFilter,
} from "@/lib/config/constants";

/**
 * The pre-qualification filter panel (JSV2S1153).
 *
 * The categories ARE the four filters, and each one's values are the outcomes
 * that filter produced — so the question "why was this rejected" is answerable
 * as "experience, below the floor" rather than the coarser "experience".
 *
 * Values are scoped to the current view: in the review queue only outcomes that
 * appear among review jobs are offered, so no checkbox can return nothing.
 *
 * Nothing applies until Apply is pressed — ticking five boxes should cost one
 * query, not five. Selections are written to the URL, so a filtered view stays
 * linkable and the back button works; the panel holds draft state only.
 */

/** The date range is a category in its own right, last in the rail. */
const DATE_KEY = "__date" as const;
type CategoryKey = PrequalFilter | typeof DATE_KEY;

export function PrequalFilters({
  view,
  facets,
  initial,
  initialFrom,
  initialTo,
  initialSearch,
  resultCount,
}: {
  view: string;
  facets: ReviewFacets;
  initial: FilterSelections;
  initialFrom: string | null;
  initialTo: string | null;
  initialSearch: string | null;
  resultCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CategoryKey>(PREQUAL_FILTERS[0]);
  const [selected, setSelected] = useState<FilterSelections>(initial);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [search, setSearch] = useState(initialSearch ?? "");

  const chosen = (f: PrequalFilter) => selected[f] ?? [];
  const activeCount =
    PREQUAL_FILTERS.reduce((n, f) => n + chosen(f).length, 0) +
    (from ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function toggle(filter: PrequalFilter, value: string) {
    setSelected((s) => {
      const current = s[filter] ?? [];
      return {
        ...s,
        [filter]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      };
    });
  }

  function apply() {
    const params = new URLSearchParams();
    if (view !== "review") params.set("view", view);
    for (const f of PREQUAL_FILTERS) {
      if (chosen(f).length > 0) params.set(f, chosen(f).join(","));
    }
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (search.trim()) params.set("q", search.trim());

    const qs = params.toString();
    router.push(qs ? `/review?${qs}` : "/review");
    setOpen(false);
  }

  function clearAll() {
    setSelected({});
    setFrom(null);
    setTo(null);
    setSearch("");
  }

  const options = category === DATE_KEY ? [] : (facets[category] ?? []);

  return (
    <div className="relative flex items-center justify-between gap-3 border-b border-line pb-2.5">
      <span className="text-xs tabular-nums text-muted">
        {resultCount} {resultCount === 1 ? "job" : "jobs"}
        {activeCount > 0 ? " matching" : ""}
      </span>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
      >
        Filter
        {activeCount > 0 ? (
          <span className="rounded bg-foreground px-1.5 text-[10px] tabular-nums text-background">
            {activeCount}
          </span>
        ) : (
          <span className="text-muted">☰</span>
        )}
      </button>

      {open ? (
        <>
          {/* Click-away. A panel you can only close with its own button is a
              trap once it covers the list you are trying to read. */}
          <button
            type="button"
            aria-label="Close filters"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />

          <div className="absolute top-full right-0 z-30 mt-1 w-[42rem] max-w-[94vw] rounded-lg border border-line bg-surface shadow-lg">
            <div className="flex items-center gap-3 border-b border-line p-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && apply()}
                placeholder="Search title or company"
                className="flex-1 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={apply}
                className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
              >
                Apply Filters
              </button>
            </div>

            <div className="flex min-h-[19rem]">
              <nav className="w-44 shrink-0 border-r border-line p-2">
                {PREQUAL_FILTERS.map((f) => {
                  const n = chosen(f).length;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setCategory(f)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs ${
                        f === category
                          ? "bg-surface-muted font-medium"
                          : "text-muted hover:bg-surface-muted hover:text-foreground"
                      }`}
                    >
                      <span>
                        {PREQUAL_FILTER_LABELS[f]}
                        {n > 0 ? <span className="ml-1 text-accent">({n})</span> : null}
                      </span>
                      <span className="text-faint">›</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setCategory(DATE_KEY)}
                  className={`mt-1 flex w-full items-center justify-between rounded-md border-t border-line px-2 pt-2.5 pb-1.5 text-left text-xs ${
                    category === DATE_KEY
                      ? "font-medium"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <span>
                    Judged between
                    {from ? <span className="ml-1 text-accent">(1)</span> : null}
                  </span>
                  <span className="text-faint">›</span>
                </button>
              </nav>

              {/* One pane, two contents: the chosen filter's values, or the
                  calendar. Keeping the date out here rather than below means
                  the panel is one shape whatever is selected. */}
              <div className="max-h-[19rem] flex-1 overflow-y-auto p-3">
                {category === DATE_KEY ? (
                  <DateRangePicker
                    from={from}
                    to={to}
                    onChange={(f, t) => {
                      setFrom(f);
                      setTo(t);
                    }}
                  />
                ) : options.length === 0 ? (
                  <p className="text-xs text-muted">
                    No {PREQUAL_FILTER_LABELS[category as PrequalFilter].toLowerCase()}{" "}
                    outcomes in this view.
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {options.map((o) => (
                      <li key={o.value}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-surface-muted">
                          <input
                            type="checkbox"
                            checked={chosen(category as PrequalFilter).includes(o.value)}
                            onChange={() => toggle(category as PrequalFilter, o.value)}
                            className="size-4"
                          />
                          <span className="flex-1">{o.label}</span>
                          <span className="text-xs tabular-nums text-faint">
                            {o.count}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {activeCount > 0 ? (
              <div className="flex justify-end border-t border-line px-3 py-2">
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-muted hover:text-foreground"
                >
                  Clear all
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
