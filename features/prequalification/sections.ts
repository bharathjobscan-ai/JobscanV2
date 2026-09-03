import type { SectionId } from "@/config/prequalification";
import { normalizeText } from "./normalize";

/**
 * JD section splitter.
 *
 * The source PRD's whole domain design rests on `responsibilities`,
 * `requirements` and `nice_to_have` being separate fields. They are not:
 * `raw_jobs.description` is one text blob and Apify returns one blob. Without
 * this file every section weight in the config is inert.
 *
 * The hard part is that headings are not standardised. "What you'll do", "Your
 * impact", "The role" and "Key responsibilities" all mean the same section, and
 * a posting may use markdown headings, bold, ALL CAPS, or a bare line ending in
 * a colon. When nothing is detectable — which is common — the whole description
 * becomes one `body` section rather than being force-fit into a guess.
 */

export type JdSection = { id: SectionId; text: string };

/**
 * Heading phrase → section, longest-intent-first.
 *
 * Order is load-bearing: "preferred qualifications" and "nice to have" must be
 * tested before "qualifications" and "requirements", or an optional-skills
 * block gets scored at full requirements weight — exactly the false positive
 * the PRD's own SaaS-analytics test case is about.
 */
const HEADING_PATTERNS: readonly (readonly [SectionId, readonly string[]])[] = [
  [
    "nice_to_have",
    [
      "nice to have",
      "nice-to-have",
      "nice to haves",
      "bonus points",
      "bonus if",
      "bonus",
      "preferred qualifications",
      "preferred experience",
      "preferred skills",
      "desirable",
      "would be great",
      "great to have",
      "plus points",
      "extra credit",
      "icing on the cake",
    ],
  ],
  [
    "responsibilities",
    [
      "what you'll do",
      "what you will do",
      "what you'll be doing",
      "what youll do",
      "responsibilities",
      "key responsibilities",
      "your responsibilities",
      "the role",
      "about the role",
      "your role",
      "role overview",
      "in this role",
      "day to day",
      "day-to-day",
      "your impact",
      "the impact you'll have",
      "what the job involves",
      "your mission",
    ],
  ],
  [
    "requirements",
    [
      "requirements",
      "the requirements",
      "about you",
      "what we're looking for",
      "what we are looking for",
      "what were looking for",
      "what you'll bring",
      "what you will bring",
      "what you bring",
      "qualifications",
      "minimum qualifications",
      "basic qualifications",
      "your experience",
      "experience required",
      "skills and experience",
      "who you are",
      "your profile",
      "must have",
      "must haves",
      "essential",
      "we'd love to hear from you if",
    ],
  ],
  [
    "company_description",
    [
      "about us",
      "about the company",
      // LinkedIn's own boilerplate heading, seen on real postings.
      "company description",
      "about",
      "who we are",
      "our mission",
      "our story",
      "why join",
      "why us",
      "our culture",
      "our values",
      "benefits",
      "what we offer",
      "perks",
      "equal opportunity",
      "diversity",
      "how to apply",
    ],
  ],
  [
    "summary",
    [
      "summary",
      "job summary",
      "overview",
      "job overview",
      "the opportunity",
      "introduction",
      "position summary",
    ],
  ],
];

/**
 * Does this line look like a heading rather than prose?
 *
 * Kept conservative. Treating a sentence as a heading silently truncates the
 * section above it, which is worse than missing a heading and falling back to
 * one body block.
 */
function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return false;

  // Markdown heading or bold-only line.
  if (/^#{1,6}\s+\S/.test(trimmed)) return true;
  if (/^\*\*[^*]+\*\*:?$/.test(trimmed)) return true;
  if (/^__[^_]+__:?$/.test(trimmed)) return true;

  // A bullet is content, never a heading.
  if (/^[-*•▪]\s/.test(trimmed)) return false;

  // ALL CAPS line with no terminal punctuation.
  const letters = trimmed.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 3 && letters === letters.toUpperCase() && !/[.!?]$/.test(trimmed)) {
    return true;
  }

  // A short line ending in a colon, e.g. "What you'll do:".
  if (/:$/.test(trimmed) && trimmed.split(/\s+/).length <= 9) return true;

  // A short line with no terminal punctuation sitting on its own.
  if (!/[.!?,;]$/.test(trimmed) && trimmed.split(/\s+/).length <= 6) return true;

  return false;
}

function classifyHeading(line: string): SectionId | null {
  const text = normalizeText(line.replace(/^#{1,6}\s*/, "").replace(/[*_:]/g, ""));
  if (!text) return null;

  for (const [section, phrases] of HEADING_PATTERNS) {
    for (const phrase of phrases) {
      const normalised = normalizeText(phrase);
      if (text === normalised || text.startsWith(`${normalised} `) || text.includes(normalised)) {
        return section;
      }
    }
  }
  return null;
}

/**
 * Split a description into weighted sections.
 *
 * Returns a single `body` section when no headings are recognised, which is the
 * common case for LinkedIn descriptions pasted as one paragraph. Text appearing
 * before the first recognised heading becomes `summary` — it is almost always
 * the role blurb.
 */
export function splitSections(description: string | null | undefined): JdSection[] {
  const raw = (description ?? "").trim();
  if (!raw) return [];

  const lines = raw.split(/\r?\n/);
  const buckets = new Map<SectionId, string[]>();
  let current: SectionId | null = null;
  let sawHeading = false;

  const push = (id: SectionId, text: string) => {
    const existing = buckets.get(id);
    if (existing) existing.push(text);
    else buckets.set(id, [text]);
  };

  for (const line of lines) {
    if (looksLikeHeading(line)) {
      const section = classifyHeading(line);
      if (section) {
        sawHeading = true;
        current = section;
        // The heading itself carries signal — "Payments responsibilities".
        push(section, line);
        continue;
      }
    }
    if (line.trim()) push(current ?? "summary", line);
  }

  // Nothing recognisable: one bucket, weighted below a real requirements block.
  if (!sawHeading) return [{ id: "body", text: raw }];

  return [...buckets.entries()]
    .map(([id, parts]) => ({ id, text: parts.join("\n").trim() }))
    .filter((section) => section.text.length > 0);
}
