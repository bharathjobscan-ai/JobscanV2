import {
  AlignmentType,
  BorderStyle,
  LineRuleType,
  Paragraph,
  TextRun,
} from "docx";

import { contactRuns } from "./contact";

/**
 * Cover letter layout.
 *
 * Everything except the prose is generated here: header, date, recipient
 * block, salutation and sign-off. The model writes body paragraphs only, which
 * keeps the scaffolding identical across applications, spends no tokens on
 * boilerplate, and removes any chance of an invented address or a wrong date.
 *
 * The parser strips any scaffolding the model emits anyway, so nothing can
 * appear twice.
 */

const FONT = "Calibri";
const ACCENT = "1F3864";

/** Looser than the CV's 0.9 — a letter is read, not scanned. */
const LINE_SPACING = 276; // 1.15 where 240 is single
const BODY = 21; // 10.5pt
const SMALL = 19; // 9.5pt

export type LetterMeta = {
  candidateName: string;
  candidateContact: string;
  company: string;
  role: string;
  location?: string | null;
  date?: Date;
};

/**
 * Lines the model should not be writing, removed if it does anyway.
 *
 * Matched by shape rather than exact text: a date on its own line, a contact
 * line, a `Dear …` opener, a sign-off, or the candidate's own name standing
 * alone. Anything else is body prose and is kept.
 */
const DATE_LINE =
  /^\s*(\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})\s*$/;
const CONTACT_LINE = /@|\+\d{1,3}[\s\d]{6,}|linkedin/i;
const SALUTATION = /^\s*(dear|hello|hi)\b/i;
const SIGN_OFF = /^\s*(best regards|kind regards|regards|sincerely|yours\s+\w+|thanks|thank you)[,.]?\s*$/i;

/**
 * Extract just the prose, discarding any scaffolding.
 *
 * The recipient block is the awkward case: three or four short lines with no
 * punctuation that look like prose to a naive parser. It is only ever at the
 * top, before the salutation or first real sentence, so lines are dropped
 * until something sentence-shaped appears.
 */
export function extractLetterBody(markdown: string, meta: LetterMeta): string[] {
  const raw = markdown.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let started = false;

  const nameParts = meta.candidateName.toLowerCase().split(/\s+/).filter(Boolean);
  const isCandidateName = (line: string) => {
    const l = line.toLowerCase().replace(/[^a-z\s]/g, "").trim();
    return l.length > 0 && l.length < 40 && nameParts.every((p) => l.includes(p));
  };

  for (const original of raw) {
    const line = original.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
    if (!line) {
      if (started) kept.push("");
      continue;
    }
    if (/^(-{3,}|_{3,})$/.test(line)) continue;

    if (SIGN_OFF.test(line)) break; // sign-off and anything after it is ours
    if (isCandidateName(line)) continue;
    if (DATE_LINE.test(line)) continue;
    if (CONTACT_LINE.test(line) && line.length < 120) continue;
    if (SALUTATION.test(line)) {
      started = true; // body begins after the salutation
      continue;
    }

    // Before the body proper, skip short unpunctuated recipient-block lines.
    if (!started) {
      const sentenceLike = line.length > 60 || /[.?!]$/.test(line);
      if (!sentenceLike) continue;
      started = true;
    }
    kept.push(line);
  }

  // Join wrapped lines into paragraphs on blank-line boundaries.
  const paragraphs: string[] = [];
  let buffer: string[] = [];
  for (const line of kept) {
    if (line === "") {
      if (buffer.length) paragraphs.push(buffer.join(" "));
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length) paragraphs.push(buffer.join(" "));

  return paragraphs.filter(Boolean);
}

function line(text: string, opts: {
  bold?: boolean;
  size?: number;
  color?: string;
  after?: number;
  center?: boolean;
} = {}): Paragraph {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: opts.after ?? 40, line: LINE_SPACING, lineRule: LineRuleType.AUTO },
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        size: opts.size ?? BODY,
        font: FONT,
        color: opts.color,
      }),
    ],
  });
}

export function buildLetter(markdown: string, meta: LetterMeta): Paragraph[] {
  const date = meta.date ?? new Date();
  const dateText = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const out: Paragraph[] = [
    // Header matches the CV exactly, so the pair reads as one set.
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 30 },
      children: [
        new TextRun({
          text: meta.candidateName.toUpperCase(),
          bold: true,
          size: 29,
          font: FONT,
          color: ACCENT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120, line: LINE_SPACING, lineRule: LineRuleType.AUTO },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 6 },
      },
      children: contactRuns(meta.candidateContact, SMALL),
    }),

    line(dateText, { size: SMALL, after: 180 }),

    // Recipient block — first line bold, as the reference letters set it.
    line("Hiring Team", { bold: true, after: 20 }),
    line(meta.company, { after: 20 }),
  ];

  if (meta.location) out.push(line(meta.location, { after: 180 }));
  else out[out.length - 1] = line(meta.company, { after: 180 });

  // "Dear Delivery Hero SE Hiring Team" reads like a database record. The
  // legal suffix belongs in the address block, not the greeting.
  const greetingName = meta.company
    .replace(/[,.]?\s+(SE|N\.?V\.?|B\.?V\.?|GmbH|AG|S\.?A\.?|Ltd\.?|Limited|Inc\.?|LLC|LLP|PLC|Pty|Oy|AB|A\/S)\.?$/i, "")
    .trim();

  out.push(line(`Dear ${greetingName || meta.company} Hiring Team,`, { after: 160 }));

  for (const paragraph of extractLetterBody(markdown, meta)) {
    out.push(line(paragraph, { after: 160 }));
  }

  out.push(
    line("Best regards,", { after: 20 }),
    line(meta.candidateName, { bold: true }),
  );

  return out;
}
