import { PROFILE_LINKS } from "./contact";

/**
 * JSV2S1057 — ATS hygiene, done deterministically.
 *
 * The backlog note filed this as "a prompt-level change in CVG". It is not.
 * Whitespace faults, glyph bullets, smart quotes and a malformed profile URL
 * are mechanical defects with exactly one correct repair, so asking a model to
 * avoid them costs output tokens on every run, cannot be verified, and still
 * fails intermittently — the ATS lens in SimG scored 82 on precisely these
 * three faults after the prompt already forbade them.
 *
 * So the prompt stops asking (see lib/ai/prompts.ts) and this module repairs.
 * Everything with one right answer is REPAIRED; everything that would require
 * rewriting the author's content is FLAGGED for SimG and the workspace.
 *
 * Runs inside `settleAiJobs`, the single write path (ADR-0005), so the stored
 * markdown is already clean and the .docx, the on-screen copy and the download
 * can never disagree.
 */

export type AtsRepairCode =
  | "whitespace"
  | "smart_punctuation"
  | "invisible_characters"
  | "bullet_glyphs"
  | "profile_url"
  | "blank_lines";

export type AtsFindingCode =
  | "table"
  | "html"
  | "image"
  | "header_nonstandard"
  | "contact_missing";

export type AtsRepair = { code: AtsRepairCode; count: number; detail: string };
export type AtsFinding = { code: AtsFindingCode; detail: string };

export type AtsReport = {
  repairs: AtsRepair[];
  findings: AtsFinding[];
  /** 0-100, deterministic. The parse-readiness half of SimG's ATS lens. */
  parseScore: number;
};

export type AtsResult = { markdown: string; report: AtsReport };

/** Section headings an ATS is known to map to a field. */
const STANDARD_HEADINGS = [
  "summary",
  "profile",
  "professional summary",
  "experience",
  "professional experience",
  "work experience",
  "education",
  "skills",
  "core skills",
  "core competencies",
  "competencies",
  "key achievements",
  "technical skills",
  "certifications",
  "projects",
  "achievements",
  "publications",
  "languages",
  "work authorisation",
  "work authorization",
];

/** Bullet glyphs models reach for that parsers drop silently. */
const GLYPH_BULLET = /^[•●▪◦‣⁃·]\s+/;

/** Zero-width and directional marks. Invisible on screen, poison in a parser. */
const INVISIBLE = /[​-‍⁠﻿­‎‏]/g;

const SMART_PUNCTUATION: [RegExp, string][] = [
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  [/…/g, "..."],
  // Em and en dashes are kept: they render correctly and carry meaning in a
  // date range, which the .docx renderer relies on to set dates flush right.
];

/**
 * The canonical profile URL, from the one place that already owns it.
 */
const CANONICAL_LINKEDIN = PROFILE_LINKS.linkedin;

/**
 * A LinkedIn profile reference, tolerant of the ways a model mangles one:
 * a missing scheme, a stray space after `https:`, a `www.`, a trailing slash,
 * or the whole thing wrapped in a markdown link.
 *
 * Deliberately anchored tightly. An earlier version padded both ends with
 * `\s*` and swallowed the blank line after the contact line, welding it to the
 * next heading; it also consumed a closing parenthesis it had not opened.
 * Nothing outside the URL itself may be matched.
 */
const LINKEDIN_BARE =
  /(?:https?:\s*\/\/\s*)?(?:www\.)?linkedin\.com\/in\/([A-Za-z0-9._~%-]+)\/?/gi;

/** The same, as a markdown link, so the label is discarded with it. */
const LINKEDIN_MARKDOWN =
  /\[[^\]]*\]\((?:https?:\s*\/\/\s*)?(?:www\.)?linkedin\.com\/in\/([A-Za-z0-9._~%-]+)\/?\)/gi;

/**
 * Rewrite the candidate's own profile link, and only that.
 *
 * The header block is canonicalised whatever slug it carries — a typo there is
 * the defect this story exists to fix. The body is left alone entirely: a cover
 * letter may legitimately name a referrer's profile, and rewriting that to the
 * candidate's own URL is silent corruption, which is exactly what the first
 * version of this function did.
 */
function repairProfileUrl(text: string): { text: string; count: number } {
  // The header is everything before the first section heading — the contact
  // block. Anything after it is prose that may reference other people.
  const firstSection = text.search(/^##\s+/m);
  const splitAt = firstSection === -1 ? text.length : firstSection;
  const header = text.slice(0, splitAt);
  const body = text.slice(splitAt);

  let count = 0;
  const rewrite = (match: string) => {
    if (match === CANONICAL_LINKEDIN) return match;
    count += 1;
    return CANONICAL_LINKEDIN;
  };

  const repaired =
    header.replace(LINKEDIN_MARKDOWN, rewrite).replace(LINKEDIN_BARE, rewrite) + body;

  return { text: repaired, count };
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * Repair what has one right answer; report what does not.
 *
 * Order matters: invisible characters are stripped before anything measures
 * whitespace, and the profile URL is rewritten before spaces are collapsed, so
 * a URL broken *by* a stray space is still recognised.
 */
export function applyAtsHygiene(markdown: string): AtsResult {
  const repairs: AtsRepair[] = [];
  let text = markdown.replace(/\r\n/g, "\n");

  const invisible = countMatches(text, INVISIBLE);
  if (invisible > 0) {
    text = text.replace(INVISIBLE, "");
    repairs.push({
      code: "invisible_characters",
      count: invisible,
      detail: `Removed ${invisible} zero-width or directional character(s).`,
    });
  }

  let smart = 0;
  for (const [pattern, replacement] of SMART_PUNCTUATION) {
    smart += countMatches(text, pattern);
    text = text.replace(pattern, replacement);
  }
  if (smart > 0) {
    repairs.push({
      code: "smart_punctuation",
      count: smart,
      detail: `Replaced ${smart} curly quote(s) or ellipsis with ASCII.`,
    });
  }

  // The profile URL, in the header block only. A markdown link is replaced
  // whole, label included, because a bare URL is what a parser extracts and a
  // recruiter can click in either medium.
  const profile = repairProfileUrl(text);
  text = profile.text;
  const profileFixes = profile.count;
  if (profileFixes > 0) {
    repairs.push({
      code: "profile_url",
      count: profileFixes,
      detail: `Rewrote ${profileFixes} LinkedIn reference(s) to ${CANONICAL_LINKEDIN}.`,
    });
  }

  const lines = text.split("\n");
  let glyphs = 0;
  let whitespace = 0;

  const cleaned = lines.map((line) => {
    let next = line.replace(/\t/g, " ").replace(/ /g, " ");

    if (GLYPH_BULLET.test(next.trimStart())) {
      const indent = next.length - next.trimStart().length;
      next = " ".repeat(indent) + next.trimStart().replace(GLYPH_BULLET, "- ");
      glyphs += 1;
    }

    // Collapse runs of spaces inside the line, then strip the trailing run.
    // Markdown's two-space line break is not used anywhere in a CV or letter
    // and the .docx renderer ignores it, so nothing is lost by removing it.
    const before = next;
    next = next.replace(/(\S) {2,}(?=\S)/g, "$1 ").replace(/\s+$/, "");
    if (next !== before) whitespace += 1;

    return next;
  });

  if (glyphs > 0) {
    repairs.push({
      code: "bullet_glyphs",
      count: glyphs,
      detail: `Converted ${glyphs} glyph bullet(s) to "- ".`,
    });
  }
  if (whitespace > 0) {
    repairs.push({
      code: "whitespace",
      count: whitespace,
      detail: `Normalised whitespace on ${whitespace} line(s).`,
    });
  }

  text = cleaned.join("\n");

  const runs = countMatches(text, /\n{3,}/g);
  if (runs > 0) {
    text = text.replace(/\n{3,}/g, "\n\n");
    repairs.push({
      code: "blank_lines",
      count: runs,
      detail: `Collapsed ${runs} run(s) of blank lines.`,
    });
  }

  text = text.trim() + "\n";

  return { markdown: text, report: { repairs, ...inspect(text) } };
}

/**
 * What hygiene cannot fix: structure that needs the author's judgement.
 *
 * These are reported, never rewritten. Deleting a table would delete content;
 * renaming a heading could rename a section the reader chose deliberately.
 */
function inspect(text: string): { findings: AtsFinding[]; parseScore: number } {
  const findings: AtsFinding[] = [];
  const lines = text.split("\n");

  const tableLines = lines.filter((l) => /^\s*\|.*\|\s*$/.test(l)).length;
  if (tableLines > 0) {
    findings.push({
      code: "table",
      detail: `${tableLines} table row(s). Most parsers read a table in column order and scramble it — move the content into bullets.`,
    });
  }

  const html = countMatches(text, /<(?!<<)[a-z][^>]*>/gi);
  if (html > 0) {
    findings.push({
      code: "html",
      detail: `${html} raw HTML tag(s). The renderer emits them literally.`,
    });
  }

  if (/!\[[^\]]*\]\(/.test(text)) {
    findings.push({
      code: "image",
      detail: "An image. No ATS reads one, and several reject the file.",
    });
  }

  const headings = lines
    .filter((l) => /^#{2}\s+/.test(l))
    .map((l) => l.replace(/^#{2}\s+/, "").trim().toLowerCase());
  const nonstandard = headings.filter(
    (h) => !STANDARD_HEADINGS.some((s) => h === s || h.startsWith(s)),
  );
  if (nonstandard.length > 0) {
    findings.push({
      code: "header_nonstandard",
      detail: `Section heading(s) an ATS will not map to a field: ${nonstandard.join(", ")}.`,
    });
  }

  // A CV with no contact line has lost the one field every ATS requires.
  const hasContact = /@|linkedin\.com/i.test(lines.slice(0, 8).join("\n"));
  if (!hasContact) {
    findings.push({
      code: "contact_missing",
      detail: "No email or profile link in the header block.",
    });
  }

  // Weighted by how badly each defect degrades extraction, floored at 0. The
  // repaired faults are deliberately absent: by the time this runs they are
  // gone, so counting them would report a problem that no longer exists.
  const penalty =
    (tableLines > 0 ? 25 : 0) +
    (html > 0 ? 10 : 0) +
    (findings.some((f) => f.code === "image") ? 20 : 0) +
    nonstandard.length * 5 +
    (hasContact ? 0 : 30);

  return { findings, parseScore: Math.max(0, 100 - penalty) };
}
