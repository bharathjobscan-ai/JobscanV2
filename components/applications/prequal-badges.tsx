import { Badge } from "@/components/ui/base";
import {
  PREQUALIFICATION_LABELS,
  PREQUAL_FILTER_LABELS,
  type FilterStatus,
  type PrequalDecision,
  type PrequalFilter,
} from "@/lib/config/constants";

/**
 * Pre-qualification badges (JSV2S1038, JSV2S1138).
 *
 * `Badge` takes a fixed five-tone union and no `className`, so these reuse the
 * existing tones rather than widening it — one more tone for one more feature
 * is how a palette stops meaning anything.
 */

export function PrequalBadge({
  decision,
  reason,
}: {
  decision: PrequalDecision | null;
  reason?: string | null;
}) {
  if (!decision) return null;
  const tone =
    decision === "pass" ? "positive" : decision === "review" ? "warning" : "negative";
  return (
    <Badge tone={tone} title={reason ?? undefined}>
      {PREQUALIFICATION_LABELS[decision]}
    </Badge>
  );
}

/**
 * A city Bharath actively wants to work in.
 *
 * The whole reason JSV2S1138 exists: a qualifying job in Frankfurt and one in
 * Berlin are not equally interesting, and the score cannot say so because it
 * knows nothing about preference.
 */
export function PreferredCityBadge({ city }: { city: string | null }) {
  if (!city) return null;
  return (
    <Badge tone="info" title="A city you want to work in">
      ★ {city}
    </Badge>
  );
}

/** Per-filter verdicts, so a decision is readable without opening anything. */
export function FilterStatusRow({
  statuses,
}: {
  statuses: Partial<Record<PrequalFilter, FilterStatus>>;
}) {
  const entries = Object.entries(statuses) as [PrequalFilter, FilterStatus][];
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {entries.map(([filter, status]) => (
        <Badge
          key={filter}
          tone={status === "pass" ? "positive" : status === "fail" ? "negative" : "warning"}
        >
          {PREQUAL_FILTER_LABELS[filter]}: {status}
        </Badge>
      ))}
    </div>
  );
}
