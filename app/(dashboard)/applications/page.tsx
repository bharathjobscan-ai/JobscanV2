import Link from "next/link";

import { Card, EmptyState, LinkButton } from "@/components/ui/base";
import { getApplicationCosts } from "@/features/ai/queries";
import { cityById } from "@/config/cities";
import { CityGrid } from "@/components/applications/city-grid";
import { CityTable } from "@/components/applications/city-table";
import { CityBackdrop } from "@/components/applications/city-backdrop";
import { getCitySummaries } from "@/features/applications/cities";
import { CityFilters } from "@/components/applications/city-filters";
import { formatUsd } from "@/lib/ai/pricing";
import {
  countByView,
  countIncomplete,
  getApplicationFacets,
  listApplications,
  relativeCutoff,
} from "@/features/applications/queries";
import {
  APPLICATION_VIEWS,
  VIEW_LABELS,
  type ApplicationView,
} from "@/lib/config/constants";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  /*
   * No city chosen means the front door (JSV2S1172).
   *
   * The table is unchanged and still does the work; it is now reached THROUGH a
   * city rather than instead of one. Returned before any of the filter parsing
   * below, because none of it applies to a grid of eight photographs and doing
   * the queries anyway would cost a round trip per visit for nothing.
   */
  const city = cityById(params.city);
  if (!city) {
    const summaries = await getCitySummaries();
    return <CityGrid summaries={summaries} />;
  }

  const view = (
    APPLICATION_VIEWS.includes(params.view as ApplicationView)
      ? params.view
      : "all"
  ) as ApplicationView;


  /**
   * Faceted filtering (JSV2S1159, JSV2S1172). Unrecognised values from a
   * hand-edited URL are narrowed away in the query layer rather than raised
   * here.
   *
   * The multi-value facets the generic panel used are still honoured from the
   * URL so older links keep working, even though the city panel now writes one
   * value per axis.
   */
  const MULTI = ["match", "referral", "company", "source", "country", "fetch"] as const;
  // Taken whole, never split: a location is "London Area, United Kingdom", and
  // comma-splitting it produced a filter that could never match anything.
  const SINGLE = ["location", "posted", "visa", "tier", "minJob", "minResume"] as const;
  const selections: Record<string, string[]> = {};
  for (const key of MULTI) {
    const values = params[key]?.split(",").filter(Boolean) ?? [];
    if (values.length > 0) selections[key] = values;
  }
  for (const key of SINGLE) {
    const value = params[key]?.trim();
    if (value) selections[key] = [value];
  }
  // The city is a route, not a facet — it is not offered in the panel and
  // cannot be unticked, so it is applied separately from the user's selections.
  selections.city = [city.id];
  const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  // "Date uploaded" is the relative face of the existing ingest-date range, so
  // it resolves to the same `from` bound rather than adding a second axis that
  // could contradict it.
  const from = isDate(params.from) ?? relativeCutoff(params.uploaded);
  const to = isDate(params.to);
  const search = params.q?.trim() || null;

  const [items, counts, incomplete, facets] = await Promise.all([
    listApplications({ view, selections, from, to, search }),
    countByView(city.id),
    countIncomplete(city.id),
    getApplicationFacets(view, city.id),
  ]);

  /**
   * JSV2S1141 — spend visible while triaging, not only after opening a row.
   *
   * One batched query for the whole page: per-row lookups would be an N+1
   * against a database on another continent. The aggregation is the same pure
   * function the detail view uses, so the two can never disagree.
   */
  const costs = await getApplicationCosts(items.map((item) => item.id));
  const pageTotal = [...costs.values()].reduce((sum, c) => sum + c.totalUsd, 0);

  return (
    <div className="flex flex-col gap-5">
      <CityBackdrop city={city} />

      <div className="relative flex flex-col gap-5">
      <div>
        <Link
          href="/applications"
          className="text-[11px] text-muted underline-offset-2 hover:underline"
        >
          ← All cities
        </Link>
        <h1 className="n-display mt-1 text-5xl leading-none">{city.name}</h1>
        <p
          className="mt-1.5 text-[10px] font-medium tracking-[0.18em] uppercase"
          style={{ color: "var(--slate)" }}
        >
          {city.country}
        </p>
      </div>

      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-muted">
          {counts.all} tracked
          {incomplete > 0 ? ` · ${incomplete} missing a job description` : ""}
          {pageTotal > 0 ? ` · ${formatUsd(pageTotal)} AI spend in this view` : ""}
        </p>
        <LinkButton href="/upload" variant="primary">
          Upload jobs
        </LinkButton>
      </div>

      <nav className="flex flex-wrap items-center gap-1 border-b border-line">
        {APPLICATION_VIEWS.map((key) => {
          const active = key === view;
          return (
            <Link
              key={key}
              /* The city has to survive a tab change, or every tab is a door
                 back out to the grid. */
              href={
                key === "all"
                  ? `/applications?city=${city.id}`
                  : `/applications?city=${city.id}&view=${key}`
              }
              className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {VIEW_LABELS[key]}
              <span className="ml-1.5 text-subtle">{counts[key]}</span>
            </Link>
          );
        })}
      </nav>

      {/* JSV2S1172 — the design's inline panel: it pushes the table down
          rather than covering it, because a popover this tall hides the rows
          you are filtering. */}
      <CityFilters
        cityId={city.id}
        view={view === "all" ? undefined : view}
        facets={facets}
        initial={{
          q: search ?? "",
          uploaded: params.uploaded ?? "",
          posted: selections.posted?.[0] ?? "",
          fetch: selections.fetch?.[0] ?? "",
          location: selections.location?.[0] ?? "",
          visa: selections.visa?.[0] ?? "",
          tier: selections.tier?.[0] ?? "",
          minJob: selections.minJob?.[0] ?? "",
          minResume: selections.minResume?.[0] ?? "",
        }}
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title={
              counts.all === 0
                ? `Nothing in ${city.name} yet`
                : `Nothing in ${VIEW_LABELS[view]}`
            }
            hint={
              counts.all === 0
                ? "The nightly fetch adds to this city automatically. You can also upload a CSV, XLSX or JSON of jobs."
                : "Try another view, or widen the filters."
            }
            action={
              counts.all === 0 ? (
                <LinkButton href="/upload" variant="primary">
                  Upload jobs
                </LinkButton>
              ) : null
            }
          />
        </Card>
      ) : (
        <CityTable items={items} />
      )}

      <p className="pb-4 text-[11px]" style={{ color: "var(--faint)" }}>
        {items.length} of {counts.all} shown · sorted by job score
      </p>
      </div>
    </div>
  );
}
