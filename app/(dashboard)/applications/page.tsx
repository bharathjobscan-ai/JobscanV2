import Link from "next/link";

import {
  MatchBadge,
  ReferralBadge,
  ScoreBadge,
  StatusBadge,
} from "@/components/applications/badges";
import { Badge, Card, EmptyState, LinkButton } from "@/components/ui/base";
import { settleAiJobs } from "@/features/ai/tasks";
import {
  countByView,
  countIncomplete,
  listApplications,
} from "@/features/applications/queries";
import {
  APPLICATION_VIEWS,
  VIEW_LABELS,
  type ApplicationView,
} from "@/lib/config/constants";

function relative(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = (
    APPLICATION_VIEWS.includes(params.view as ApplicationView)
      ? params.view
      : "all"
  ) as ApplicationView;

  // Promote anything the local worker finished since the last page load.
  await settleAiJobs();

  const [items, counts, incomplete] = await Promise.all([
    listApplications(view),
    countByView(),
    countIncomplete(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Applications</h1>
          <p className="text-xs text-muted">
            {counts.all} tracked
            {incomplete > 0 ? ` · ${incomplete} missing a job description` : ""}
          </p>
        </div>
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
              href={key === "all" ? "/applications" : `/applications?view=${key}`}
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

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title={
              counts.all === 0
                ? "No applications yet"
                : `Nothing in ${VIEW_LABELS[view]}`
            }
            hint={
              counts.all === 0
                ? "Upload a CSV, XLSX or JSON of jobs to get started. Every valid row becomes an application ready to work."
                : "Try another view."
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
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/applications/${item.id}`}
                  className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-surface-muted sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {item.title}
                      </span>
                      {item.isIncomplete ? (
                        <Badge tone="warning" title="No job description — scoring and tailoring are disabled">
                          Incomplete
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {item.company}
                      {item.location ? ` · ${item.location}` : ""}
                      {" · "}
                      <span className="text-subtle">{item.source}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <MatchBadge category={item.matchCategory} />
                    <ReferralBadge status={item.referralStatus} />
                    <StatusBadge status={item.status} isPending={item.isPending} />
                    <span className="w-8 text-right">
                      <ScoreBadge score={item.jobScore} />
                    </span>
                  </div>

                  <div className="w-full shrink-0 text-xs sm:w-44 sm:text-right">
                    <p className="truncate font-medium">{item.nextAction}</p>
                    <p className="text-subtle">{relative(item.lastActivityAt)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
