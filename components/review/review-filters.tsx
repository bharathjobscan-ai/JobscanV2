"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  POSTED_WINDOWS,
  POSTED_WINDOW_LABELS,
  PREQUAL_FILTERS,
  PREQUAL_FILTER_LABELS,
  type PostedWindow,
  type PrequalFilter,
} from "@/lib/config/constants";

/**
 * The queue's own filter row (JSV2S1172).
 *
 * Deliberately NOT `components/ui/filter-panel.tsx`. That panel exists for the
 * applications list, where a filter combines several facets and a tick costs a
 * query, so nothing applies until Apply. Here there is one question — which gate
 * held the job back — and five answers, so a drawer with a two-column rail and
 * an Apply button was three interactions to ask a one-word question.
 *
 * Everything lives in the URL, so a filtered queue is linkable and the back
 * button undoes a chip. `preserve` carries the params this row does not own
 * (the view, and the value-level selections the pipeline and detail screens
 * deep-link with, e.g. `/review?fetch=<runId>`) so changing a chip never
 * silently drops the filter that got you here.
 */
export function ReviewFilters({
  decidedBy,
  posted,
  search,
  preserve,
  count,
}: {
  decidedBy: readonly PrequalFilter[];
  posted: PostedWindow;
  search: string | null;
  preserve: Record<string, string>;
  count: number;
}) {
  const router = useRouter();
  const [text, setText] = useState(search ?? "");

  /**
   * The URL is the source of truth: a back button or a deep link must move the
   * box, which it cannot do while the box only seeds itself on mount. Adjusted
   * during render rather than in an effect — an effect would paint the stale
   * text first and then correct it.
   */
  const [applied, setApplied] = useState(search ?? "");
  if (applied !== (search ?? "")) {
    setApplied(search ?? "");
    setText(search ?? "");
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function urlFor(next: { chips?: readonly PrequalFilter[]; age?: PostedWindow; q?: string }) {
    const params = new URLSearchParams(preserve);
    const chips = next.chips ?? decidedBy;
    if (chips.length > 0) params.set("decidedBy", chips.join(","));
    const age = next.age ?? posted;
    if (age !== "any") params.set("posted", age);
    const q = (next.q ?? text).trim();
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/review?${qs}` : "/review";
  }

  function toggle(filter: PrequalFilter) {
    const chips = decidedBy.includes(filter)
      ? decidedBy.filter((f) => f !== filter)
      : [...decidedBy, filter];
    router.push(urlFor({ chips }));
  }

  function onType(value: string) {
    setText(value);
    // Debounced: a query per keystroke would put five round trips behind a
    // four-letter company name.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.push(urlFor({ q: value })), 350);
  }

  return (
    <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
      <label className="sr-only" htmlFor="review-q">
        Search
      </label>
      <input
        id="review-q"
        type="search"
        value={text}
        onChange={(e) => onType(e.target.value)}
        placeholder="Role or company"
        className="min-h-9 w-[210px] rounded-md border border-line bg-transparent px-3 text-[13.5px] outline-none placeholder:text-faint focus:border-line-strong"
      />

      <label className="sr-only" htmlFor="review-posted">
        Posted within
      </label>
      <select
        id="review-posted"
        value={posted}
        onChange={(e) => router.push(urlFor({ age: e.target.value as PostedWindow }))}
        className="min-h-9 rounded-md border border-line bg-transparent px-2.5 text-[13px] outline-none focus:border-line-strong"
      >
        {POSTED_WINDOWS.map((w) => (
          <option key={w} value={w} className="bg-surface">
            {POSTED_WINDOW_LABELS[w]}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-1.5">
        {PREQUAL_FILTERS.map((filter) => {
          const on = decidedBy.includes(filter);
          return (
            <button
              key={filter}
              type="button"
              onClick={() => toggle(filter)}
              aria-pressed={on}
              className={`min-h-9 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors ${
                on ? "" : "border-line text-muted hover:text-foreground"
              }`}
              style={
                on
                  ? {
                      borderColor: "var(--gold)",
                      color: "var(--gold)",
                      background: "color-mix(in srgb, var(--gold) 10%, transparent)",
                    }
                  : undefined
              }
            >
              {PREQUAL_FILTER_LABELS[filter]}
            </button>
          );
        })}
      </div>

      <span className="n-mono ml-auto text-xs tabular-nums text-faint">
        {count} held back
      </span>
    </div>
  );
}
