import Link from "next/link";

import { BinSelection } from "@/components/applications/bin-selection";
import { DELETABLE_AFTER_DAYS } from "@/lib/config/constants";
import { countDeletable } from "@/features/prequalification/mutations";
import { HeldJobRow } from "@/components/review/held-job-row";
import { ReviewFilters } from "@/components/review/review-filters";
import { Button, Card, EmptyState } from "@/components/ui/base";
import {
  binAction,
  deleteBinnedFormAction,
  restoreAction,
  requalifyAction,
} from "@/features/prequalification/actions";
import {
  countForReview,
  listForReview,
  REVIEW_VIEWS,
  REVIEW_VIEW_LABELS,
  type FilterSelections,
  type ReviewView,
} from "@/features/prequalification/queries";
import {
  POSTED_WINDOWS,
  PREQUAL_FILTERS,
  type PostedWindow,
  type PrequalFilter,
} from "@/lib/config/constants";

export const dynamic = "force-dynamic";

/** A repeated param (`?decidedBy=a&decidedBy=b`) arrives as an array. */
function values(param: string | string[] | undefined): string[] {
  const raw = Array.isArray(param) ? param : param ? [param] : [];
  return raw.flatMap((v) => v.split(",")).filter(Boolean);
}

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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  /**
   * An unrecognised view degrades to the default rather than 404-ing.
   *
   * `?view=stale` was a real tab until JSV2S1172 and is still in browser
   * history and in old links, so it has to land somewhere sensible.
   */
  const requested = one("view");
  const view: ReviewView = REVIEW_VIEWS.includes(requested as ReviewView)
    ? (requested as ReviewView)
    : "review";

  // JSV2S1153. Anything unrecognised is dropped rather than raised: a
  // hand-edited URL should degrade to "no filter", never to a crash.
  //
  // Value-level selections have no control on this screen any more, but the
  // pipeline and application-detail screens deep-link with them
  // (`/review?fetch=<runId>`, `?company=…`, `?visa=…`), so they are still read
  // and still applied.
  const selections: FilterSelections = {};
  for (const f of [...PREQUAL_FILTERS, "company", "fetch"] as const) {
    const chosen = values(params[f]);
    if (chosen.length > 0) selections[f] = chosen;
  }

  const decidedBy = values(params.decidedBy).filter((v): v is PrequalFilter =>
    PREQUAL_FILTERS.includes(v as PrequalFilter),
  );
  const postedParam = one("posted");
  const posted: PostedWindow = POSTED_WINDOWS.includes(postedParam as PostedWindow)
    ? (postedParam as PostedWindow)
    : "any";

  const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = isDate(one("from"));
  const to = isDate(one("to"));
  const search = one("q")?.trim() || null;

  const [items, counts, deletable] = await Promise.all([
    listForReview({ view, selections, decidedBy, postedWithin: posted, from, to, search }),
    countForReview(),
    // Only the Bin offers deletion, so only the Bin pays for the count.
    view === "binned" ? countDeletable() : Promise.resolve(0),
  ]);

  const filtered =
    Object.values(selections).some((v) => v.length > 0) ||
    decidedBy.length > 0 ||
    posted !== "any" ||
    from !== null ||
    search !== null;

  // What the filter row must carry across a chip toggle, so a deep link is not
  // thrown away by the first click on the screen it landed on.
  const preserve: Record<string, string> = {};
  if (view !== "review") preserve.view = view;
  for (const [key, chosen] of Object.entries(selections)) {
    if (chosen.length > 0) preserve[key] = chosen.join(",");
  }
  if (from) preserve.from = from;
  if (to) preserve.to = to;

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
        {/*
         * The re-run button outlived the "Rules changed" view (JSV2S1172): the
         * stale count is worth acting on, not worth browsing.
         */}
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

      <ReviewFilters
        decidedBy={decidedBy}
        posted={posted}
        search={search}
        preserve={preserve}
        count={items.length}
      />

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
                    : "The Bin is empty"
            }
            hint={
              // A filtered empty result must not read as "the queue is clear".
              filtered
                ? "Clear a chip or widen the posted window to see more."
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
            /* Only the Bin can destroy, and only there does it make sense: a
               job in the working queues is still a decision waiting to be
               made. */
            destroy={view === "binned" ? deleteBinnedFormAction : undefined}
            hint={
              view === "binned"
                ? `Tick a job to restore it. Deleting is permanent and only applies to jobs binned more than ${DELETABLE_AFTER_DAYS} days ago — ${deletable} qualify today.`
                : undefined
            }
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
