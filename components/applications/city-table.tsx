import Link from "next/link";

import type { ApplicationListItem } from "@/features/applications/queries";
import { VISA_LABELS, visaStatusOf } from "@/features/applications/visa";
import { MATCH_LABELS, type MatchCategory } from "@/lib/config/constants";
import { StarButton } from "./star-button";

/**
 * The per-city table (JSV2S1172), transcribed from the design project.
 *
 * The design's ten columns, all of them. The star was omitted while nothing
 * backed it — a control that does nothing is worse than a missing one — and
 * restored once `applications.starred_at` existed (JSV2S1173).
 *
 * The two score columns are the point of the layout: JOB is what ScoreG said
 * about the posting, RESUME is what SimG said about the CV written for it.
 * They are different instruments answering different questions, which is why
 * the design gives them separate columns rather than one blended number.
 */

const STATUS_LABEL: Record<string, string> = {
  ready_to_apply: "Ready to apply",
  applied: "Applied",
  shortlisted: "Shortlisted",
  interview: "Interview",
  offer: "Offer",
  rejected_application: "Rejected",
  rejected_screening: "Rejected at screening",
  rejected_interview: "Rejected at interview",
  rejected_visa: "Rejected on visa",
};

/** Days since posting, in the design's compact form. */
function age(at: Date | null): string {
  if (!at) return "—";
  const days = Math.floor((Date.now() - at.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d old";
  if (days < 30) return `${days}d old`;
  return `${Math.floor(days / 30)}mo old`;
}

/**
 * The visa column, which is the reason this product exists.
 *
 * Reads the gate's own outputs rather than a field of its own: a tier-4
 * watchlist hit is confirmation, `gate_qualified` means every filter passed at
 * a known sponsor, and everything else is the absence of evidence rather than
 * evidence of absence — which is why the third state says "no evidence" and
 * not "no sponsorship".
 */
function visaCell(item: ApplicationListItem): { label: string; tone: string } {
  switch (visaStatusOf(item)) {
    case "confirmed":
      return { label: VISA_LABELS.confirmed, tone: "var(--positive)" };
    case "gate_qualified":
      return { label: VISA_LABELS.gate_qualified, tone: "var(--gold)" };
    case "none":
      // A tier below 4 is still worth naming, but it is not evidence — it sits
      // inside "no evidence" for the filter, and must not become a fourth
      // state the select cannot offer.
      return item.watchlistTier !== null
        ? { label: `Watchlist ${item.watchlistTier}`, tone: "var(--gold-soft)" }
        : { label: VISA_LABELS.none, tone: "var(--faint)" };
  }
}

function Score({ value, dim }: { value: number | null; dim?: boolean }) {
  if (value === null) {
    return <span className="text-faint">—</span>;
  }
  return (
    <span
      className="n-display text-[19px] leading-none"
      style={{ color: dim ? "var(--slate)" : "var(--platinum)" }}
    >
      {value}
    </span>
  );
}

export function CityTable({ items }: { items: ApplicationListItem[] }) {
  if (items.length === 0) {
    return (
      <p className="border-t border-line py-14 text-center text-sm text-muted">
        Nothing here yet. The nightly fetch adds to this city automatically.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="px-2 py-2.5">
              <span className="sr-only">Starred</span>
            </th>
            {["Job", "Resume", "Role", "Company", "Posted", "Visa", "Status", "Action"].map(
              (h, i) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-[10px] font-medium tracking-[0.14em] whitespace-nowrap uppercase"
                  style={{
                    color: "var(--faint)",
                    textAlign: i < 2 ? "center" : "left",
                  }}
                >
                  {h}
                </th>
              ),
            )}
            <th className="px-3 py-2.5">
              <span className="sr-only">More</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => {
            const visa = visaCell(item);
            return (
              <tr
                key={item.id}
                className="border-b transition-colors hover:bg-surface"
                style={{ borderColor: "var(--hair)" }}
              >
                <td className="px-2 py-3 text-center">
                  <StarButton
                    applicationId={item.id}
                    starred={item.starred}
                    title={item.title}
                  />
                </td>
                <td className="px-3 py-3 text-center">
                  <Score value={item.jobScore} />
                </td>
                <td className="px-3 py-3 text-center">
                  <Score value={item.resumeScore} dim />
                </td>

                <td className="max-w-[24rem] px-3 py-3">
                  <Link
                    href={`/applications/${item.id}`}
                    className="line-clamp-1 hover:underline"
                    style={{ color: "var(--platinum)" }}
                  >
                    {item.title}
                  </Link>
                </td>

                <td className="px-3 py-3 whitespace-nowrap text-muted">
                  {item.company}
                  {item.watchlistTier !== null ? (
                    <span
                      className="ml-1.5"
                      style={{ color: "var(--gold)" }}
                      title={`On the sponsorship watchlist at tier ${item.watchlistTier}`}
                    >
                      ★ {item.watchlistTier}
                    </span>
                  ) : null}
                </td>

                <td className="n-mono px-3 py-3 whitespace-nowrap text-faint">
                  {age(item.ingestedAt)}
                </td>

                <td className="px-3 py-3 whitespace-nowrap">
                  <span style={{ color: visa.tone }}>{visa.label}</span>
                </td>

                <td className="px-3 py-3 whitespace-nowrap text-muted">
                  {STATUS_LABEL[item.status] ?? item.status}
                  {item.matchCategory && item.matchCategory !== "gate_qualified" ? (
                    <span className="ml-1.5 text-faint">
                      · {MATCH_LABELS[item.matchCategory as MatchCategory]}
                    </span>
                  ) : null}
                </td>

                <td className="px-3 py-3">
                  <Link
                    href={`/applications/${item.id}`}
                    className="inline-block rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors"
                    style={{ borderColor: "var(--gold)", color: "var(--gold)" }}
                  >
                    {item.status === "ready_to_apply" ? "Apply" : "Open"}
                  </Link>
                </td>

                <td className="px-2 py-3">
                  {/* The design's row menu is a popover. A plain link to the
                      posting covers the one item in it that is not already a
                      guarded server action on the detail screen — and a menu
                      whose destructive entries live elsewhere is worse than no
                      menu. */}
                  <a
                    href={item.jobUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Open the original posting"
                    className="px-1.5 text-faint hover:text-foreground"
                  >
                    ↗
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
