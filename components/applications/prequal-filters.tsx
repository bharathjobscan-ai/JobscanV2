import Link from "next/link";

import { inputClass } from "@/components/ui/base";
import {
  PREQUAL_FILTERS,
  PREQUAL_FILTER_LABELS,
  type PrequalFilter,
} from "@/lib/config/constants";
import {
  REVIEW_VIEWS,
  REVIEW_VIEW_LABELS,
  type ReviewView,
} from "@/features/prequalification/queries";

/**
 * Filtering the pre-qualification queue (JSV2S1153).
 *
 * A plain GET form: two selects and a date range, submitted to the same page.
 * State therefore lives entirely in the URL, so a filtered view is linkable,
 * the back button works, and there is no client JavaScript or hydration cost.
 *
 * `decidedBy` is the filter dimension, NOT "any filter that failed". A job can
 * fail two rules; only one decided it. Filtering on failures would double-count
 * and send tuning after the wrong rule.
 */
export function PrequalFilters({
  view,
  factor,
  from,
  to,
  byFactor,
  resultCount,
}: {
  view: ReviewView;
  factor: PrequalFilter | null;
  from: string | null;
  to: string | null;
  byFactor: Record<string, number>;
  resultCount: number;
}) {
  const filtered = factor !== null || from !== null || to !== null;
  const total = Object.values(byFactor).reduce((n, v) => n + v, 0);

  return (
    <form
      method="get"
      action="/review"
      className="flex flex-wrap items-end gap-3 border-b border-line pb-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-[10px] tracking-wide text-faint uppercase">Status</span>
        <select name="view" defaultValue={view} className={`${inputClass} w-40`}>
          {REVIEW_VIEWS.map((v) => (
            <option key={v} value={v}>
              {REVIEW_VIEW_LABELS[v]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] tracking-wide text-faint uppercase">
          Because of
        </span>
        <select
          name="factor"
          defaultValue={factor ?? ""}
          className={`${inputClass} w-52`}
        >
          <option value="">Any reason ({total})</option>
          {PREQUAL_FILTERS.map((f) => (
            // The count makes an empty facet visibly empty before it is chosen,
            // rather than looking like a live filter that returns nothing.
            <option key={f} value={f}>
              {PREQUAL_FILTER_LABELS[f]} ({byFactor[f] ?? 0})
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] tracking-wide text-faint uppercase">
          Judged from
        </span>
        <input
          type="date"
          name="from"
          defaultValue={from ?? ""}
          className={`${inputClass} w-40`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] tracking-wide text-faint uppercase">To</span>
        <input
          type="date"
          name="to"
          defaultValue={to ?? ""}
          className={`${inputClass} w-40`}
        />
      </label>

      <button
        type="submit"
        className="h-9 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90"
      >
        Apply
      </button>

      {filtered ? (
        <Link
          href="/review"
          className="h-9 px-2 text-xs leading-9 text-muted hover:text-foreground"
        >
          Clear
        </Link>
      ) : null}

      <span className="ml-auto self-center text-xs tabular-nums text-muted">
        {resultCount} {resultCount === 1 ? "job" : "jobs"}
        {filtered ? " matching" : ""}
      </span>
    </form>
  );
}
