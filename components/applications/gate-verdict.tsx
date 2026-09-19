import { Badge } from "@/components/ui/base";
import { VISA_REASON_LABELS } from "@/features/prequalification/labels";
import type { VisaResult } from "@/features/prequalification/visa";
import type { WatchlistMatch } from "@/features/companies/lookup";
import type { AffinityMatch } from "@/features/companies/lookup";

/**
 * The two new pillars, made visible (JSV2S1166, JSV2S1165).
 *
 * Built alongside the filters rather than after them, because a deterministic
 * gate whose working you cannot see is one you stop trusting and then stop
 * using — and the visa filter in particular makes a rejection that is
 * irreversible from the owner's side. If it starts removing jobs it should not,
 * the only way anyone finds out is by reading the sentence it rejected on.
 */

export function VisaSignal({ visa }: { visa: VisaResult | null | undefined }) {
  if (!visa) return null;

  const tone =
    visa.category === "remove"
      ? "negative"
      : visa.category === "keep"
        ? "positive"
        : "warning";

  /*
   * Silence is the majority case and saying nothing about it is right: a badge
   * on every job reading "nothing said about visas" would be noise on hundreds
   * of rows and would train the eye to skip exactly the row that matters.
   */
  if (visa.reasonCode === "UNKNOWN" && visa.evidence.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <Badge tone={tone} title={visa.reason}>
        {VISA_REASON_LABELS[visa.reasonCode] ?? visa.reasonCode}
      </Badge>

      {visa.evidence.length > 0 ? (
        <ul className="space-y-1">
          {visa.evidence.map((e, i) => (
            <li
              key={`${e.ruleId}-${i}`}
              className="border-l-2 border-line-strong pl-2.5 text-[11px] text-muted italic"
            >
              “{e.text}”
              <span className="ml-1.5 text-faint not-italic">
                {e.ruleId}
                {e.scoped ? " · under a visa heading" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The watchlist bump.
 *
 * Deliberately styled as a note rather than a verdict: it can never reject, and
 * making it look like a filter result would be the start of treating it as one.
 */
export function WatchlistSignal({
  watchlist,
}: {
  watchlist: WatchlistMatch | null | undefined;
}) {
  if (!watchlist) return null;
  return (
    <Badge
      tone="info"
      title={
        watchlist.note ??
        (watchlist.skipsScoring
          ? "Known sponsor — strong enough that scoring is skipped"
          : "Known sponsor — still scored")
      }
    >
      ★ Sponsor · {watchlist.name} · tier {watchlist.tier}
      {watchlist.skipsScoring ? " · unscored" : ""}
    </Badge>
  );
}

/**
 * Why a job with no payments vocabulary is here at all (JSV2S1167).
 *
 * Shown wherever the override fired, because an application admitted on the
 * company's name rather than on the posting's content is the one the owner most
 * needs to be able to find and argue with.
 */
export function AffinityNote({
  affinity,
  rawStatus,
}: {
  affinity: AffinityMatch | null | undefined;
  rawStatus?: string;
}) {
  if (!affinity || rawStatus !== "fail") return null;
  return (
    <Badge
      tone="info"
      title={
        affinity.tier === "core"
          ? `Payments is ${affinity.name}'s business, so a posting that does not say so is still worth having`
          : `${affinity.name} has a payments arm, so this needs a read rather than a rejection`
      }
    >
      No payments wording · admitted on {affinity.name}
    </Badge>
  );
}

/**
 * The whole gate verdict, for an application that PASSED (JSV2S1165).
 *
 * Until now the pillar-by-pillar output was visible only where a job was held
 * or screened out, which left a PASS as the one verdict that could not be
 * inspected — and a pass is what spends money. Every filter is listed, the ones
 * that qualified included, because "domain passed on these six terms" is the
 * sentence that tells you whether the gate is working.
 */
export function GateVerdictPanel({
  detail,
}: {
  detail: {
    reason?: string;
    domain?: {
      status?: string;
      score?: number;
      matchedTerms?: string[];
      primaryDomain?: string | null;
      affinity?: AffinityMatch | null;
      rawStatus?: string;
    };
    visa?: VisaResult;
    role?: { status?: string; reason?: string };
    location?: { status?: string; reason?: string; preferredCity?: string | null };
    experience?: { status?: string; reason?: string };
    watchlist?: WatchlistMatch | null;
  } | null;
}) {
  if (!detail) {
    return (
      <p className="text-xs text-muted">
        No recorded verdict — this job predates the gate.
      </p>
    );
  }

  const rows: [string, string | undefined, string | undefined][] = [
    [
      "Domain",
      detail.domain?.status,
      detail.domain?.matchedTerms?.length
        ? `${detail.domain.score ?? ""} — ${detail.domain.matchedTerms.slice(0, 10).join(", ")}`
        : "no payments vocabulary found",
    ],
    ["Visa language", detail.visa?.status, detail.visa?.reason],
    ["Role", detail.role?.status, detail.role?.reason],
    ["Location", detail.location?.status, detail.location?.reason],
    ["Experience", detail.experience?.status, detail.experience?.reason],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <WatchlistSignal watchlist={detail.watchlist} />
        <AffinityNote
          affinity={detail.domain?.affinity}
          rawStatus={detail.domain?.rawStatus}
        />
      </div>

      <dl className="grid grid-cols-[8rem_4rem_1fr] gap-y-1.5 text-xs">
        {rows.map(([label, status, note]) => (
          <div key={label} className="contents">
            <dt className="text-subtle">{label}</dt>
            <dd
              className={
                status === "pass"
                  ? "text-positive"
                  : status === "fail"
                    ? "text-negative"
                    : "text-warning"
              }
            >
              {status ?? "—"}
            </dd>
            <dd className="text-muted">{note ?? "—"}</dd>
          </div>
        ))}
      </dl>

      <VisaSignal visa={detail.visa} />
    </div>
  );
}
