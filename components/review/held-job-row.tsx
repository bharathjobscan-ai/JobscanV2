import Link from "next/link";
import { BIN_FORM_ID } from "@/components/applications/bin-selection";
import {
  AffinityNote,
  VisaSignal,
  WatchlistSignal,
} from "@/components/applications/gate-verdict";
import { PreferredCityBadge, PrequalBadge } from "@/components/applications/prequal-badges";
import { Badge, buttonClass } from "@/components/ui/base";
import { promoteAction, rejectAction } from "@/features/prequalification/actions";
import type { ReviewItem } from "@/features/prequalification/queries";
import {
  PREQUAL_FILTER_LABELS,
  type FilterStatus,
  type PrequalFilter,
} from "@/lib/config/constants";

const DOT_COLOUR: Record<FilterStatus, string> = {
  pass: "var(--positive)",
  fail: "var(--negative)",
  unknown: "var(--warning)",
};

/**
 * Per-filter verdicts as a dot rail rather than a row of badges (JSV2S1172).
 *
 * Five badges at the same weight as the decision badge made every row read as
 * an alarm; the design puts the verdict alone on the right and demotes the
 * gates to a quiet legend under the reason.
 */
function GateRail({ statuses }: { statuses: Partial<Record<PrequalFilter, FilterStatus>> }) {
  // A filter with no recorded status is dropped rather than shown as
  // "visa: undefined" — verdicts stored before a filter existed have none, and
  // that is not the same as a filter that returned nothing.
  const entries = Object.entries(statuses).filter((e): e is [PrequalFilter, FilterStatus] =>
    Boolean(e[1]),
  );
  if (entries.length === 0) return null;

  return (
    <div className="mt-3.5 flex flex-wrap gap-x-3.5 gap-y-2">
      {entries.map(([filter, status]) => (
        <div key={filter} className="flex items-baseline gap-[7px]">
          <span
            className="size-1.5 flex-none -translate-y-0.5 rounded-full"
            style={{ background: DOT_COLOUR[status] }}
          />
          <span className="text-[12.5px] whitespace-nowrap text-muted">
            {PREQUAL_FILTER_LABELS[filter]}
          </span>
          <span
            className="text-[12.5px] whitespace-nowrap"
            style={{ color: DOT_COLOUR[status] }}
          >
            {status}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Posting age, in the words the design uses for it. */
function ageLabel(days: number): string {
  if (days === 0) return "posted today";
  if (days === 1) return "1 day ago";
  if (days < 14) return `${days} days ago`;
  if (days < 28) return `${Math.round(days / 7)} weeks ago`;
  return "over a month ago";
}

function ageTone(days: number): string {
  return days <= 3 ? "var(--positive)" : days <= 14 ? "var(--platinum)" : "var(--faint)";
}

function daysSince(iso: string): number | null {
  const posted = Date.parse(iso);
  if (Number.isNaN(posted)) return null;
  return Math.max(0, Math.floor((Date.now() - posted) / 86_400_000));
}

/**
 * One job the deterministic gate held back.
 *
 * A hairline-separated article rather than a card: the queue is a list to work
 * through, and eight bordered boxes read as eight unrelated objects.
 */
export function HeldJobRow({ item }: { item: ReviewItem }) {
  const d = item.detail;
  const days = item.postedAt ? daysSince(item.postedAt) : null;

  return (
    <article className="border-b border-line px-1.5 py-[18px]">
      <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2.5">
            {/* Joins the bulk form by id, not by nesting: this row already
                contains promote and reject forms, and a nested <form> is
                dropped by the browser. */}
            <input
              type="checkbox"
              name="jobId"
              form={BIN_FORM_ID}
              value={item.id}
              aria-label={`Select ${item.title}`}
              className="size-3.5 shrink-0 self-center accent-[var(--gold)]"
            />
            <a
              href={item.jobUrl}
              target="_blank"
              rel="noreferrer"
              className="n-display text-[19px] font-semibold tracking-[-0.01em] hover:underline"
            >
              {item.title}
            </a>
            <span className="text-[13px] text-muted">
              {item.company}
              {item.location ? ` · ${item.location}` : ""}
            </span>
          </div>

          {/* JSV2S1158 — when it was judged, and which fetch brought it in.
              Without the run id a job in the queue cannot be traced back to the
              batch it arrived with. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[12px]">
            {days !== null ? (
              <>
                <span className="n-mono whitespace-nowrap" style={{ color: ageTone(days) }}>
                  {ageLabel(days)}
                </span>
                <span className="text-faint">·</span>
              </>
            ) : null}
            <span className="n-mono text-faint">
              judged{" "}
              {item.prequalifiedAt
                ? item.prequalifiedAt.toLocaleString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
            {item.ingestionRunId ? (
              <>
                <span className="text-faint">·</span>
                <span className="n-mono text-[11px] text-faint" title={item.ingestionRunId}>
                  run {item.ingestionRunId.slice(0, 8)}
                </span>
              </>
            ) : null}
          </div>

          <p className="mt-3 text-[14.5px] text-foreground">
            {d?.reason ?? "No recorded reason."}
          </p>

          <div className="mt-1 space-y-1 text-[13px] text-muted">
            {/* JSV2S1166 — the sentence the visa filter acted on, and the
                company signals, shown rather than asserted. */}
            <VisaSignal visa={d?.visa} />
            <AffinityNote affinity={d?.domain.affinity} rawStatus={d?.domain.rawStatus} />

            {d && d.domain.matchedTerms.length > 0 ? (
              <p className="text-subtle">
                Domain {d.domain.score} — {d.domain.matchedTerms.slice(0, 8).join(", ")}
                {d.domain.matchedTerms.length > 8 ? "…" : ""}
              </p>
            ) : null}

            {d && d.domain.suppressed.length > 0 ? (
              <p className="text-subtle">
                Ignored: {d.domain.suppressed.map((s) => s.why).join("; ")}
              </p>
            ) : null}
          </div>

          {d ? (
            <GateRail
              statuses={{
                domain: d.domain.status,
                visa: d.visa?.status,
                role: d.role.status,
                location: d.location.status,
                experience: d.experience.status,
              }}
            />
          ) : null}
        </div>

        <div className="flex flex-none flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <PreferredCityBadge city={d?.location.preferredCity ?? null} />
            <WatchlistSignal watchlist={d?.watchlist} />
            {item.stale ? (
              <Badge tone="info" title="Judged under an older configuration">
                Rules changed
              </Badge>
            ) : null}
            <PrequalBadge decision={item.decision} reason={d?.reason} />
          </div>

          {/* A discarded application, in the Bin with its job (2026-09-24).
              It is already promoted, so Promote would fail and Reject means
              nothing; Restore, above, is how it comes back. */}
          {item.applicationId ? (
            <>
              <Badge tone="info" title="Discarded from Applications. Restoring brings back its documents too.">
                Discarded application
              </Badge>
              <Link
                href={`/applications/${item.applicationId}`}
                className={`${buttonClass.ghost} min-h-8 px-3 text-[12.5px] whitespace-nowrap`}
              >
                Open application
              </Link>
            </>
          ) : (
            <form action={promoteAction}>
              <input type="hidden" name="rawJobId" value={item.id} />
              <button
                type="submit"
                className={`${buttonClass.primary} min-h-8 px-3 text-[12.5px] whitespace-nowrap`}
              >
                Promote
              </button>
            </form>
          )}

          {item.decision !== "reject" && !item.applicationId ? (
            <form action={rejectAction}>
              <input type="hidden" name="rawJobId" value={item.id} />
              <button
                type="submit"
                className={`${buttonClass.ghost} min-h-8 px-3 text-[12.5px] whitespace-nowrap`}
              >
                Reject
              </button>
            </form>
          ) : null}

          <a
            href={item.jobUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11.5px] text-faint underline underline-offset-2 hover:text-foreground"
          >
            Open posting
          </a>
        </div>
      </div>
    </article>
  );
}
