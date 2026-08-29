import { Badge } from "@/components/ui/base";
import {
  MATCH_HINTS,
  MATCH_LABELS,
  REFERRAL_LABELS,
  REJECTION_STATUSES,
  STATUS_LABELS,
  type ApplicationStatus,
  type MatchCategory,
  type ReferralStatus,
} from "@/lib/config/constants";

export function StatusBadge({
  status,
  isPending,
}: {
  status: ApplicationStatus;
  isPending?: boolean;
}) {
  // The derived Pending state (C2) reads as its own thing in the UI even though
  // the stored status is still `applied`.
  if (isPending) {
    return <Badge tone="warning" title="No response within the waiting period">Deemed Pending</Badge>;
  }

  const tone =
    status === "offer"
      ? "positive"
      : REJECTION_STATUSES.includes(status)
        ? "negative"
        : status === "interview" || status === "shortlisted"
          ? "info"
          : "neutral";

  return <Badge tone={tone}>{STATUS_LABELS[status]}</Badge>;
}

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-subtle">—</span>;
  // Same thresholds as ScoreG's decision bands, so colour and label agree.
  const tone =
    score >= 85 ? "positive" : score >= 70 ? "info" : score >= 55 ? "warning" : "negative";
  return <Badge tone={tone}>{score}</Badge>;
}

export function MatchBadge({ category }: { category: MatchCategory | null }) {
  if (!category) return null;
  const tone =
    category === "priority_apply"
      ? "positive"
      : category === "apply"
        ? "info"
        : category === "referral_only"
          ? "warning"
          : "negative";
  return (
    <Badge tone={tone} title={MATCH_HINTS[category]}>
      {MATCH_LABELS[category] ?? category}
    </Badge>
  );
}

export function ReferralBadge({ status }: { status: ReferralStatus }) {
  if (status === "not_needed") return null;
  const tone =
    status === "secured" ? "positive" : status === "requested" ? "info" : "warning";
  return <Badge tone={tone}>Referral: {REFERRAL_LABELS[status]}</Badge>;
}
