import Link from "next/link";

import {
  FilterStatusRow,
  PreferredCityBadge,
  PrequalBadge,
} from "@/components/applications/prequal-badges";
import { Badge, Button, Card, CardHeader, EmptyState, buttonClass } from "@/components/ui/base";
import {
  binAction,
  promoteAction,
  rejectAction,
  requalifyAction,
} from "@/features/prequalification/actions";
import { BinSelection, BIN_FORM_ID } from "@/components/applications/bin-selection";
import {
  getFacets,
  countForReview,
  listForReview,
  REVIEW_VIEWS,
  REVIEW_VIEW_LABELS,
  type FilterSelections,
  type ReviewView,
} from "@/features/prequalification/queries";
import { PrequalFilters } from "@/components/applications/prequal-filters";
import { PREQUAL_FILTERS } from "@/lib/config/constants";

export const dynamic = "force-dynamic";

/**
 * The review queue (JSV2S1038).
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
  for (const f of PREQUAL_FILTERS) {
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Pre-qualification</h1>
          <p className="mt-0.5 text-xs text-muted">
            Jobs the deterministic gate held back. Nothing here has been scored, so
            nothing here has cost anything.
          </p>
        </div>
        {counts.stale > 0 ? (
          <form action={requalifyAction}>
            <Button variant="secondary" type="submit">
              Re-run {counts.stale} under current rules
            </Button>
          </form>
        ) : null}
      </div>

      <nav className="flex items-center gap-1 border-b border-line pb-2 text-xs">
        {REVIEW_VIEWS.map((key) => (
          <Link
            key={key}
            href={key === "review" ? "/review" : `/review?view=${key}`}
            className={
              key === view
                ? "rounded-md bg-surface-muted px-2 py-1 font-medium"
                : "rounded-md px-2 py-1 text-muted hover:bg-surface-muted hover:text-foreground"
            }
          >
            {REVIEW_VIEW_LABELS[key]}{" "}
            <span className="text-subtle">{counts[key]}</span>
          </Link>
        ))}
      </nav>

      <PrequalFilters
        view={view}
        facets={facets}
        initial={selections}
        initialFrom={from}
        initialTo={to}
        initialSearch={search}
        resultCount={items.length}
      />

      {items.length === 0 ? (
        <Card>
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
                  : "Jobs that pass all four filters go straight to Applications."
            }
          />
        </Card>
      ) : (
        <BinSelection action={binAction}>
        <ul className="space-y-2">
          {items.map((item) => {
            const d = item.detail;
            return (
              <li key={item.id}>
                <Card>
                  <CardHeader
                    title={
                      <span className="flex items-center gap-2.5">
                        {/* Name and value are what the bulk action reads; one
                            ticked box and fifty use the same code path. */}
                        {/* Joins the bulk form by id, not by nesting: this row
                            already contains promote and reject forms, and a
                            nested <form> is dropped by the browser. */}
                        <input
                          type="checkbox"
                          name="jobId"
                          form={BIN_FORM_ID}
                          value={item.id}
                          aria-label={`Select ${item.title}`}
                          className="size-3.5 shrink-0"
                        />
                        <a
                          href={item.jobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {item.title}
                        </a>
                      </span>
                    }
                    meta={`${item.company}${item.location ? ` · ${item.location}` : ""}`}
                    action={
                      <div className="flex items-center gap-1.5">
                        <PreferredCityBadge city={d?.location.preferredCity ?? null} />
                        {item.stale ? (
                          <Badge tone="info" title="Judged under an older configuration">
                            Rules changed
                          </Badge>
                        ) : null}
                        <PrequalBadge decision={item.decision} reason={d?.reason} />
                      </div>
                    }
                  />

                  <div className="space-y-2 px-4 py-3 text-xs">
                    <p className="text-muted">{d?.reason ?? "No recorded reason."}</p>

                    {/* JSV2S1158 — when it was judged, and which fetch brought
                        it in. Without the run id a job in the queue cannot be
                        traced back to the batch it arrived with. */}
                    <p className="text-subtle">
                      Judged{" "}
                      {item.prequalifiedAt
                        ? item.prequalifiedAt.toLocaleString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                      {item.ingestionRunId ? (
                        <>
                          {" · run "}
                          <span
                            className="font-mono text-[10.5px] text-faint"
                            title={item.ingestionRunId}
                          >
                            {item.ingestionRunId.slice(0, 8)}
                          </span>
                        </>
                      ) : null}
                    </p>

                    {d ? (
                      <FilterStatusRow
                        statuses={{
                          role: d.role.status,
                          domain: d.domain.status,
                          experience: d.experience.status,
                          location: d.location.status,
                        }}
                      />
                    ) : null}

                    {d && d.domain.matchedTerms.length > 0 ? (
                      <p className="text-subtle">
                        Domain {d.domain.score} —{" "}
                        {d.domain.matchedTerms.slice(0, 8).join(", ")}
                        {d.domain.matchedTerms.length > 8 ? "…" : ""}
                      </p>
                    ) : null}

                    {d && d.domain.suppressed.length > 0 ? (
                      <p className="text-subtle">
                        Ignored: {d.domain.suppressed.map((s) => s.why).join("; ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 border-t border-line px-4 py-2">
                    <form action={promoteAction}>
                      <input type="hidden" name="rawJobId" value={item.id} />
                      <button type="submit" className={buttonClass.primary}>
                        Promote to application
                      </button>
                    </form>
                    {item.decision !== "reject" ? (
                      <form action={rejectAction}>
                        <input type="hidden" name="rawJobId" value={item.id} />
                        <button type="submit" className={buttonClass.ghost}>
                          Reject
                        </button>
                      </form>
                    ) : null}
                    <a
                      href={item.jobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-[11px] text-muted underline underline-offset-2 hover:text-foreground"
                    >
                      Open posting
                    </a>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
        </BinSelection>
      )}
    </div>
  );
}
