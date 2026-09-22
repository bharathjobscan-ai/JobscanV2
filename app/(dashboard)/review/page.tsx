import Link from "next/link";

import { BinSelection } from "@/components/applications/bin-selection";
import { HeldJobRow } from "@/components/review/held-job-row";
import { Button, Card, EmptyState } from "@/components/ui/base";
import { FilterPanel } from "@/components/ui/filter-panel";
import {
  binAction,
  restoreAction,
  requalifyAction,
} from "@/features/prequalification/actions";
import {
  getFacets,
  countForReview,
  listForReview,
  REVIEW_VIEWS,
  REVIEW_VIEW_LABELS,
  type FilterSelections,
  type ReviewView,
} from "@/features/prequalification/queries";
import { PREQUAL_FILTERS, PREQUAL_FILTER_LABELS } from "@/lib/config/constants";

export const dynamic = "force-dynamic";

/**
 * The review queue (JSV2S1038, restyled under JSV2S1172).
 *
 * Everything the deterministic gate could not decide on its own, with the
 * reason and the evidence in front of you. Nothing here has cost anything yet —
 * promoting is what makes a job eligible for a billed scoring call.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const view: ReviewView = REVIEW_VIEWS.includes(params.view as ReviewView)
    ? (params.view as ReviewView)
    : "review";

  // JSV2S1153. Anything unrecognised is dropped rather than raised: a
  // hand-edited URL should degrade to "no filter", never to a crash.
  const selections: FilterSelections = {};
  for (const f of [...PREQUAL_FILTERS, "company", "fetch"] as const) {
    const values = params[f]?.split(",").filter(Boolean) ?? [];
    if (values.length > 0) selections[f] = values;
  }
  const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = isDate(params.from);
  const to = isDate(params.to);
  const search = params.q?.trim() || null;

  const [items, counts, facets] = await Promise.all([
    listForReview({ view, selections, from, to, search }),
    countForReview(),
    getFacets(view),
  ]);

  const filtered =
    Object.values(selections).some((v) => v.length > 0) ||
    from !== null ||
    search !== null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="n-display text-[38px] leading-none font-normal tracking-[-0.02em]">
            Pre-qualification
          </h1>
          <p className="mt-1.5 max-w-[64ch] text-sm text-muted">
            Jobs the deterministic gate held back. Nothing here has been scored, so
            nothing here has cost anything.
          </p>
        </div>
        {counts.stale > 0 ? (
          <form action={requalifyAction}>
            <Button
              variant="secondary"
              type="submit"
              title="Re-judges the queue and every existing application. An application is never revoked — only its verdict is refreshed."
            >
              Re-run {counts.stale} under current rules
            </Button>
          </form>
        ) : null}
      </div>

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
        {REVIEW_VIEWS.map((key) => (
          <Link
            key={key}
            href={key === "review" ? "/review" : `/review?view=${key}`}
            className={`border-b-2 px-3.5 pt-2.5 pb-3 text-[13.5px] whitespace-nowrap transition-colors ${
              key === view
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {REVIEW_VIEW_LABELS[key]}
            <span className="n-mono ml-[7px] text-xs text-faint">{counts[key]}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-[18px]">
        <FilterPanel
          basePath="/review"
          preserve={{ view: view === "review" ? undefined : view }}
          categories={[
            ...PREQUAL_FILTERS.map((f) => ({ key: f, label: PREQUAL_FILTER_LABELS[f] })),
            { key: "company", label: "Company" },
            { key: "fetch", label: "Fetch" },
          ]}
          facets={facets as Record<string, { value: string; label: string; count: number }[]>}
          initial={selections as Record<string, string[]>}
          initialFrom={from}
          initialTo={to}
          initialSearch={search}
          resultCount={items.length}
          searchPlaceholder="Search title or company"
          dateLabel="Judged between"
        />
      </div>

      {items.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            title={
              filtered
                ? "Nothing matches these filters"
                : view === "review"
                  ? "Nothing waiting on you"
                  : view === "rejected"
                    ? "Nothing has been screened out"
                    : "Every verdict is current"
            }
            hint={
              // A filtered empty result must not read as "the queue is clear".
              filtered
                ? "Widen the filters or the date range to see more."
                : view === "stale"
                  ? "When you change the role, domain or location config, jobs judged under the old rules appear here."
                  : "Jobs that pass every filter go straight to Applications."
            }
          />
        </Card>
      ) : (
        /*
         * The Bin is the one view where the bulk action reverses: selecting
         * there means "put these back", not "throw these away" (JSV2S1157).
         * `BinSelection` already takes both, so the pipeline's binned count
         * now links somewhere that can undo itself rather than to a dead end.
         */
        <div className="mt-3.5">
          <BinSelection
            action={view === "binned" ? restoreAction : binAction}
            label={view === "binned" ? "Restore from Bin" : "Move to Bin"}
          >
            <div className="border-t border-line">
              {items.map((item) => (
                <HeldJobRow key={item.id} item={item} />
              ))}
            </div>
          </BinSelection>
        </div>
      )}
    </div>
  );
}
