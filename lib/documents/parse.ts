/**
 * Parse a generated CV or cover letter from markdown into a structure the
 * renderers can lay out.
 *
 * Claude drafts markdown; this turns it into blocks; the renderer applies the
 * formatting the CVG skill prescribes. Keeping layout in code rather than
 * asking the model for formatted output makes every document byte-identical in
 * style and costs roughly a third of the output tokens.
 */
export type DocBlock =
  | { kind: "name"; text: string }
  | { kind: "contact"; text: string }
  | { kind: "section"; text: string }
  /** Company/title on the left, dates flush right on the same line. */
  | { kind: "role"; text: string; right?: string }
  | { kind: "subsection"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "rule" };

export type ParsedDocument = {
  name?: string;
  blocks: DocBlock[];
  bulletCount: number;
  totalChars: number;
  /** Rendered lines, estimated — drives the one-page density calculation. */
  estimatedLines: number;
};

/** Strip inline markdown emphasis — the renderer applies weight itself. */
function clean(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A date range such as "Sep 2022 – Present" or "Apr 2019 – Aug 2022".
 *
 * Recognised so it can be pulled onto the role line and set flush right, the
 * way a professional CV sets it — which also saves a whole line per role.
 */
const DATE_RANGE =
  /^\*{0,2}\s*((?:[A-Z][a-z]{2,8}\.?\s+)?\d{4})\s*[–—-]\s*((?:[A-Z][a-z]{2,8}\.?\s+)?\d{4}|Present|Current)\s*\*{0,2}$/;

function isDateRange(line: string): boolean {
  return DATE_RANGE.test(line.trim());
}

export function parseDocument(markdown: string): ParsedDocument {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: DocBlock[] = [];
  let name: string | undefined;
  let seenSection = false;
  let bulletCount = 0;
  let totalChars = 0;
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const pending = [...buffer];
    buffer = [];

    if (!seenSection) {
      // Header lines are distinct facts — contact details on one line, work
      // authorisation on the next. Keep one block per line.
      for (const line of pending) {
        const text = clean(line);
        if (!text) continue;
        totalChars += text.length;
        blocks.push({ kind: "contact", text });
      }
      return;
    }

    const text = clean(pending.join(" "));
    if (!text) return;
    totalChars += text.length;
    blocks.push({ kind: "paragraph", text });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      flush();
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      const text = clean(heading[2]);
      if (!text) continue;
      totalChars += text.length;

      if (level === 1 && !name) {
        name = text;
        blocks.push({ kind: "name", text });
        continue;
      }

      if (level <= 2) {
        seenSection = true;
        blocks.push({ kind: "section", text });
        continue;
      }

      // A role heading: pull a following date range onto the same line.
      let right: string | undefined;
      const next = (lines[i + 1] ?? "").trim();
      if (next && isDateRange(next)) {
        right = clean(next);
        totalChars += right.length;
        i += 1;
      }

      blocks.push(
        level === 3
          ? { kind: "role", text, right }
          : { kind: "subsection", text },
      );
      continue;
    }

    const bullet = line.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      flush();
      const text = clean(bullet[1]);
      if (!text) continue;
      bulletCount += 1;
      totalChars += text.length;
      blocks.push({ kind: "bullet", text });
      continue;
    }

    buffer.push(line);
  }

  flush();

  // Roughly 105 characters fit a line at 9.5pt across A4 with 0.5in margins.
  const CHARS_PER_LINE = 105;
  const estimatedLines = blocks.reduce((total, block) => {
    if (block.kind === "rule") return total;
    if (block.kind === "section") return total + 1.6; // heading + rule + gap
    if (block.kind === "name") return total + 1.8;
    const text = "text" in block ? block.text : "";
    return total + Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
  }, 0);

  return { name, blocks, bulletCount, totalChars, estimatedLines };
}

/** Usable rendered lines on one A4 page at these margins. */
export const LINES_PER_PAGE = 52;

/**
 * Whether the content will hold a single page, and by how much it misses.
 *
 * The renderer bottoms out at 9pt, so beyond this the content itself is too
 * long — the model has to cut, which is why the prompt carries a hard bullet
 * budget.
 */
export function pageFit(markdown: string): {
  estimatedLines: number;
  fits: boolean;
  overBy: number;
} {
  const { estimatedLines } = parseDocument(markdown);
  return {
    estimatedLines: Math.round(estimatedLines),
    fits: estimatedLines <= LINES_PER_PAGE,
    overBy: Math.max(0, Math.round(estimatedLines - LINES_PER_PAGE)),
  };
}

export type Density = {
  body: number;
  bullet: number;
  name: number;
  section: number;
  lineSpacing: number;
  bulletSpacing: number;
  sectionBefore: number;
};

/**
 * Pick typography that holds a single A4 page.
 *
 * The skill's rule is content-first: condense before shrinking, and never below
 * 9pt. So this steps down only as the estimated line count approaches the ~52
 * lines an A4 page holds at this margin, and stops at 9pt — at which point the
 * content genuinely is too long and the model needs to cut, not the renderer.
 *
 * Sizes are half-points, which is what OOXML expects.
 */
export function densityFor(doc: ParsedDocument): Density {
  const lines = doc.estimatedLines;

  if (lines > 56) {
    return {
      body: 18, bullet: 18, name: 26, section: 19,
      lineSpacing: 200, bulletSpacing: 8, sectionBefore: 70,
    };
  }
  if (lines > 46) {
    return {
      body: 19, bullet: 19, name: 28, section: 20,
      lineSpacing: 210, bulletSpacing: 14, sectionBefore: 90,
    };
  }
  return {
    body: 20, bullet: 20, name: 30, section: 21,
    lineSpacing: 230, bulletSpacing: 20, sectionBefore: 120,
  };
}
