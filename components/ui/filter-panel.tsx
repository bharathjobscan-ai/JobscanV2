"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DateRangePicker } from "@/components/ui/date-range";

/**
 * A faceted filter panel (JSV2S1153, JSV2S1159).
 *
 * Generic over its categories so the pre-qualification queue and the
 * applications list share one implementation. They ask different questions —
 * "why was this screened out" versus "which of these needs a referral" — but
 * the interaction is identical, and two copies would drift the moment one
 * gained a feature.
 *
 * Nothing applies until Apply is pressed: ticking five boxes should cost one
 * query, not five. Selections live entirely in the URL, so a filtered view is
 * linkable and the back button works; the panel holds draft state only.
 */

export type FacetValue = { value: string; label: string; count: number };
export type FilterCategory = { key: string; label: string };
export type Selections = Record<string, string[]>;

/** The date range is a category in its own right, last in the rail. */
const DATE_KEY = "__date";

export function FilterPanel({
  basePath,
  preserve = {},
  categories,
  facets,
  initial,
  initialFrom,
  initialTo,
  initialSearch,
  resultCount,
  searchPlaceholder = "Search",
  dateLabel = "Date range",
  noun = "job",
}: {
  basePath: string;
  /** Params kept across an Apply — the current view, typically. */
  preserve?: Record<string, string | undefined>;
  categories: readonly FilterCategory[];
  facets: Record<string, FacetValue[] | undefined>;
  initial: Selections;
  initialFrom: string | null;
  initialTo: string | null;
  initialSearch: string | null;
  resultCount: number;
  searchPlaceholder?: string;
  dateLabel?: string;
  noun?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(categories[0]?.key ?? DATE_KEY);
  const [selected, setSelected] = useState<Selections>(initial);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [search, setSearch] = useState(initialSearch ?? "");

  const chosen = (key: string) => selected[key] ?? [];
  const activeCount =
    categories.reduce((n, c) => n + chosen(c.key).length, 0) +
    (from ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function toggle(key: string, value: string) {
    setSelected((s) => {
      const current = s[key] ?? [];
      return {
        ...s,
        [key]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      };
    });
  }

  function apply() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(preserve)) if (v) params.set(k, v);
    for (const c of categories) {
      if (chosen(c.key).length > 0) params.set(c.key, chosen(c.key).join(","));
    }
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (search.trim()) params.set("q", search.trim());

    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
    setOpen(false);
  }

  function clearAll() {
    setSelected({});
    setFrom(null);
    setTo(null);
    setSearch("");
  }

  const options = category === DATE_KEY ? [] : (facets[category] ?? []);
  const activeLabel = categories.find((c) => c.key === category)?.label ?? "";

  return (
    <div className="relative flex items-center justify-between gap-3 border-b border-line pb-2.5">
      <span className="text-xs tabular-nums text-muted">
        {resultCount} {resultCount === 1 ? noun : `${noun}s`}
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
                placeholder={searchPlaceholder}
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
                {categories.map((c) => {
                  const n = chosen(c.key).length;
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
                    {dateLabel}
                    {from ? <span className="ml-1 text-accent">(1)</span> : null}
                  </span>
                  <span className="text-faint">›</span>
                </button>
              </nav>

              {/* One pane, two contents: the chosen category's values, or the
                  calendar. The panel keeps one shape whatever is selected. */}
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
                    No {activeLabel.toLowerCase()} values in this view.
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {options.map((o) => (
                      <li key={o.value}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-surface-muted">
                          <input
                            type="checkbox"
                            checked={chosen(category).includes(o.value)}
                            onChange={() => toggle(category, o.value)}
                            className="size-4"
                          />
                          <span className="flex-1 truncate" title={o.label}>
                            {o.label}
                          </span>
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
