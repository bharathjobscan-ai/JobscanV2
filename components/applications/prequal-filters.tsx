import Link from "next/link";

import {
  PREQUAL_FILTERS,
  PREQUAL_FILTER_LABELS,
  PREQUAL_WINDOWS,
  PREQUAL_WINDOW_LABELS,
  type PrequalFilter,
  type PrequalWindow,
} from "@/lib/config/constants";
import type { ReviewView } from "@/features/prequalification/queries";

/**
 * Two-dimensional filtering of the pre-qualification queue (JSV2S1153).
 *
 * Answers "everything rejected last week on experience" and "everything held
 * for review yesterday on domain" — the questions that make the gate tunable.
 * One job at a time does not scale past the first hundred.
 *
 * State lives entirely in the URL, so a filtered view is linkable and the back
 * button works. No client state, no hydration cost.
 */

function href(
  view: ReviewView,
  factors: PrequalFilter[],
  window: PrequalWindow,
): string {
  const params = new URLSearchParams();
  if (view !== "review") params.set("view", view);
  if (factors.length > 0) params.set("factor", factors.join(","));
  if (window !== "all") params.set("window", window);
  const q = params.toString();
  return q ? `/review?${q}` : "/review";
}

const chip = (active: boolean) =>
  active
    ? "rounded-md bg-surface-muted px-2 py-1 font-medium"
    : "rounded-md px-2 py-1 text-muted hover:bg-surface-muted hover:text-foreground";

export function PrequalFilters({
  view,
  factors,
  window,
  byFactor,
}: {
  view: ReviewView;
  factors: PrequalFilter[];
  window: PrequalWindow;
  byFactor: Record<string, number>;
}) {
  const total = Object.values(byFactor).reduce((n, v) => n + v, 0);

  return (
    <div className="flex flex-col gap-2 border-b border-line pb-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[10px] tracking-wide text-faint uppercase">
          Because of
        </span>

        <Link href={href(view, [], window)} className={chip(factors.length === 0)}>
          Any reason <span className="text-subtle">{total}</span>
        </Link>

        {PREQUAL_FILTERS.map((f) => {
          const active = factors.includes(f);
          // Clicking a chip toggles it, so several factors can be combined.
          const next = active ? factors.filter((x) => x !== f) : [...factors, f];
          const count = byFactor[f] ?? 0;
          return (
            <Link
              key={f}
              href={href(view, next, window)}
              className={`${chip(active)} ${count === 0 && !active ? "opacity-45" : ""}`}
              // An empty facet stays clickable but visibly empty, rather than
              // looking like a live filter that returns nothing.
              title={count === 0 ? `No jobs decided by ${PREQUAL_FILTER_LABELS[f]}` : undefined}
            >
              {PREQUAL_FILTER_LABELS[f]} <span className="text-subtle">{count}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[10px] tracking-wide text-faint uppercase">
          When
        </span>
        {PREQUAL_WINDOWS.map((w) => (
          <Link key={w} href={href(view, factors, w)} className={chip(w === window)}>
            {PREQUAL_WINDOW_LABELS[w]}
          </Link>
        ))}
      </div>
    </div>
  );
}
