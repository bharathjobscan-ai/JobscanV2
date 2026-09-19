import { CONFIG_VERSION } from "@/config/prequalification";
import {
  PREQUAL_FILTER_LABELS,
  REJECTING_FILTERS,
  prequalDecisionFor,
  type FilterStatus,
  type PrequalFilter,
} from "@/lib/config/constants";
import { lookupAffinity, lookupWatchlist } from "@/features/companies/lookup";
import { evaluateDomain } from "./domain";
import { evaluateExperience } from "./experience";
import { evaluateLocation } from "./location";
import { evaluateRole } from "./role";
import { splitSections } from "./sections";
import { evaluateVisaLanguage } from "./visa";
import {
  FILTER_ORDER,
  type DomainResult,
  type PreQualificationResult,
  type PrequalJob,
} from "./types";

/**
 * The pre-qualification gate (PRD §18).
 *
 * Deterministic, offline and pure: no AI, no network, no database. The same job
 * and the same config always produce the same verdict, which is the property
 * that lets this run over hundreds of scraped postings before anything is
 * billed.
 *
 * It exists as a cost control first. Every job that passes here becomes a
 * Gemini scoring call, so a filter that is too permissive is not a correctness
 * problem, it is a bill.
 */
export function prequalify(job: PrequalJob): PreQualificationResult {
  const sections = splitSections(job.description);
  // Domain and experience read the split sections; a JD with no headings
  // becomes a single `body` block rather than being force-fit into a guess.
  const jdText = sections.map((s) => s.text).join("\n");

  const role = evaluateRole(job.title);
  const rawDomain = evaluateDomain(job.title, sections);
  // A primary-tier title ("Senior Product Manager") outranks a low stated years
  // requirement — the title is what the role filter already matched on.
  const experience = evaluateExperience(jdText, role.tier === "primary");
  const location = evaluateLocation(job.location, job.country, job.description);
  const visa = evaluateVisaLanguage(job.description);
  const watchlist = lookupWatchlist(job.company);

  const domain = applyAffinity(rawDomain, job.company);

  const byFilter: Record<PrequalFilter, FilterStatus> = {
    domain: domain.status,
    visa: visa.status,
    role: role.status,
    location: location.status,
    experience: experience.status,
  };

  const decision = prequalDecisionFor(byFilter);

  // Name the filter that actually drove the outcome — the first FAIL that is
  // allowed to reject, or the first non-PASS for a review. A verdict you cannot
  // attribute is one you cannot tune, and this name is what the queue filters
  // on, so evaluation order is the owner's priority order.
  const decidedBy =
    decision === "reject"
      ? (FILTER_ORDER.find(
          (f) => byFilter[f] === "fail" && REJECTING_FILTERS.includes(f),
        ) ?? null)
      : decision === "review"
        ? (FILTER_ORDER.find((f) => byFilter[f] !== "pass") ?? null)
        : null;

  const detail = { role, domain, experience, location, visa };
  const reason =
    decidedBy === null
      ? watchlist
        ? `Every filter qualifies, and ${watchlist.name} is a known sponsor.`
        : "Domain, sponsorship language, role, location and experience all qualify."
      : decision === "reject"
        ? `${PREQUAL_FILTER_LABELS[decidedBy]}: ${detail[decidedBy].reason}`
        : `${PREQUAL_FILTER_LABELS[decidedBy]} could not be confirmed — ${detail[decidedBy].reason}`;

  return {
    decision,
    decidedBy,
    reason,
    role,
    domain,
    experience,
    location,
    visa,
    watchlist,
    configVersion: CONFIG_VERSION,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Soften a domain FAIL where the company's payments affinity says the JD is
 * simply not spelling out what it does (JSV2S1167).
 *
 * Only ever softens — a domain PASS is never touched, and neither is a job at a
 * company on neither list. The original verdict is kept in `rawStatus` so the
 * override shows on the review screen as a rule that fired rather than as a
 * keyword match that never happened.
 */
function applyAffinity(domain: DomainResult, company: string | null | undefined): DomainResult {
  if (domain.status !== "fail") return domain;
  const affinity = lookupAffinity(company);
  if (!affinity) return domain;

  return {
    ...domain,
    rawStatus: domain.status,
    status: affinity.domainOutcome,
    affinity,
    reason:
      affinity.domainOutcome === "pass"
        ? `No payments vocabulary in the posting, but payments is ${affinity.name}'s business — admitted on company affinity.`
        : `No payments vocabulary in the posting; ${affinity.name} has a payments arm, so this needs a read rather than a rejection.`,
  };
}

export type { PreQualificationResult, PrequalJob } from "./types";
export { CONFIG_VERSION } from "@/config/prequalification";
