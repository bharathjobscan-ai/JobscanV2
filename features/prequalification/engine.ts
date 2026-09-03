import { CONFIG_VERSION } from "@/config/prequalification";
import {
  PREQUAL_FILTER_LABELS,
  prequalDecisionFor,
  type FilterStatus,
  type PrequalFilter,
} from "@/lib/config/constants";
import { evaluateDomain } from "./domain";
import { evaluateExperience } from "./experience";
import { evaluateLocation } from "./location";
import { evaluateRole } from "./role";
import { splitSections } from "./sections";
import { FILTER_ORDER, type PreQualificationResult, type PrequalJob } from "./types";

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
  const domain = evaluateDomain(job.title, sections);
  const experience = evaluateExperience(jdText);
  const location = evaluateLocation(job.location, job.country, job.description);

  const byFilter: Record<PrequalFilter, FilterStatus> = {
    role: role.status,
    domain: domain.status,
    experience: experience.status,
    location: location.status,
  };

  const decision = prequalDecisionFor(FILTER_ORDER.map((f) => byFilter[f]));

  // Name the filter that actually drove the outcome — the first FAIL for a
  // reject, the first non-PASS for a review. A verdict you cannot attribute is
  // one you cannot tune.
  const decidedBy =
    decision === "reject"
      ? (FILTER_ORDER.find((f) => byFilter[f] === "fail") ?? null)
      : decision === "review"
        ? (FILTER_ORDER.find((f) => byFilter[f] !== "pass") ?? null)
        : null;

  const detail = { role, domain, experience, location };
  const reason =
    decidedBy === null
      ? "Role, domain, experience and location all qualify."
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
    configVersion: CONFIG_VERSION,
    evaluatedAt: new Date().toISOString(),
  };
}

export type { PreQualificationResult, PrequalJob } from "./types";
export { CONFIG_VERSION } from "@/config/prequalification";
