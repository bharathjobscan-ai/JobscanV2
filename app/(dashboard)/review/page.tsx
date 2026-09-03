import Link from "next/link";

import {
  FilterStatusRow,
  PreferredCityBadge,
  PrequalBadge,
} from "@/components/applications/prequal-badges";
import { Badge, Button, Card, CardHeader, EmptyState, buttonClass } from "@/components/ui/base";
import { promoteAction, rejectAction, requalifyAction } from "@/features/prequalification/actions";
import {
  countForReview,
  listForReview,
  REVIEW_VIEWS,
  REVIEW_VIEW_LABELS,
  type ReviewView,
} from "@/features/prequalification/queries";

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
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: raw } = await searchParams;
  const view: ReviewView = REVIEW_VIEWS.includes(raw as ReviewView)
    ? (raw as ReviewView)
    : "review";

  const [items, counts] = await Promise.all([listForReview(view), countForReview()]);

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

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title={
              view === "review"
                ? "Nothing waiting on you"
                : view === "rejected"
                  ? "Nothing has been screened out"
                  : "Every verdict is current"
            }
            hint={
              view === "stale"
                ? "When you change the role, domain or location config, jobs judged under the old rules appear here."
                : "Jobs that pass all four filters go straight to Applications."
            }
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const d = item.detail;
            return (
              <li key={item.id}>
                <Card>
                  <CardHeader
                    title={
                      <a
                        href={item.jobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {item.title}
                      </a>
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
      )}
    </div>
  );
}
