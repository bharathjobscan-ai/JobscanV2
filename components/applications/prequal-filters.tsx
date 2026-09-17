"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DateRangePicker } from "@/components/ui/date-range";
import type { ReviewFacets } from "@/features/prequalification/queries";

/**
 * The pre-qualification filter panel (JSV2S1153).
 *
 * A category rail on the left, checkboxes for the selected category on the
 * right, a search box, and one date-range calendar. Nothing is applied until
 * Apply is pressed — ticking five boxes should cost one query, not five.
 *
 * Selections are written to the URL, so a filtered view stays linkable and the
 * back button works. The panel holds draft state only.
 *
 * The facet dimension is `decidedBy`, NOT "any filter that failed". A job can
 * fail two rules; only one decided it. Filtering on failures would double-count
 * and send tuning after the wrong rule.
 */

type Selections = {
  factor: string[];
  source: string[];
  country: string[];
};

const CATEGORIES = [
  { key: "factor", label: "Reason" },
  { key: "source", label: "Source" },
  { key: "country", label: "Country" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

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
  initial: Selections;
  initialFrom: string | null;
  initialTo: string | null;
  initialSearch: string | null;
  resultCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CategoryKey>("factor");
  const [selected, setSelected] = useState<Selections>(initial);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [search, setSearch] = useState(initialSearch ?? "");

  const activeCount =
    selected.factor.length +
    selected.source.length +
    selected.country.length +
    (from ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function toggle(key: CategoryKey, value: string) {
    setSelected((s) => ({
      ...s,
      [key]: s[key].includes(value)
        ? s[key].filter((v) => v !== value)
        : [...s[key], value],
    }));
  }

  function apply() {
    const params = new URLSearchParams();
    if (view !== "review") params.set("view", view);
    for (const { key } of CATEGORIES) {
      if (selected[key].length > 0) params.set(key, selected[key].join(","));
    }
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (search.trim()) params.set("q", search.trim());

    const qs = params.toString();
    router.push(qs ? `/review?${qs}` : "/review");
    setOpen(false);
  }

  function clearAll() {
    setSelected({ factor: [], source: [], country: [] });
    setFrom(null);
    setTo(null);
    setSearch("");
  }

  const options = facets[category] ?? [];

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
          <span className="rounded bg-foreground px-1.5 text-[10px] text-background tabular-nums">
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

          <div className="absolute top-full right-0 z-30 mt-1 w-[40rem] max-w-[92vw] rounded-lg border border-line bg-surface shadow-lg">
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
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                Apply Filters
              </button>
            </div>

            <div className="flex">
              <nav className="w-40 shrink-0 border-r border-line p-2">
                {CATEGORIES.map((c) => {
                  const n = selected[c.key].length;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setCategory(c.key)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs ${
                        c.key === category
                          ? "bg-surface-muted font-medium"
                          : "text-muted hover:bg-surface-muted hover:text-foreground"
                      }`}
                    >
                      <span>
                        {c.label}
                        {n > 0 ? <span className="ml-1 text-accent">({n})</span> : null}
                      </span>
                      <span className="text-faint">›</span>
                    </button>
                  );
                })}

                <div className="mt-2 border-t border-line pt-2">
                  <span className="px-2 text-[10px] tracking-wide text-faint uppercase">
                    Judged between
                  </span>
                </div>
              </nav>

              <div className="max-h-72 flex-1 overflow-y-auto p-3">
                {options.length === 0 ? (
                  <p className="text-xs text-muted">
                    Nothing to filter on in this view.
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {options.map((o) => (
                      <li key={o.value}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-surface-muted">
                          <input
                            type="checkbox"
                            checked={selected[category].includes(o.value)}
                            onChange={() => toggle(category, o.value)}
                            className="size-4 accent-current"
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

            <div className="flex items-start justify-between gap-4 border-t border-line p-3">
              <DateRangePicker
                from={from}
                to={to}
                onChange={(f, t) => {
                  setFrom(f);
                  setTo(t);
                }}
              />
              {activeCount > 0 ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-muted hover:text-foreground"
                >
                  Clear all
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
