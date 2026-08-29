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
  | { kind: "subsection"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "rule" };

export type ParsedDocument = {
  name?: string;
  blocks: DocBlock[];
  /** Rough length signal used to pick a font density that keeps the CV to one page. */
  bulletCount: number;
  totalChars: number;
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
    const text = clean(buffer.join(" "));
    buffer = [];
    if (!text) return;
    totalChars += text.length;
    // Lines before the first section heading are contact/meta detail.
    blocks.push({ kind: seenSection ? "paragraph" : "contact", text });
  };

  for (const raw of lines) {
    const line = raw.trim();

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
      } else if (level <= 2) {
        seenSection = true;
        blocks.push({ kind: "section", text });
      } else {
        blocks.push({ kind: "subsection", text });
      }
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
  return { name, blocks, bulletCount, totalChars };
}

/**
 * Pick font sizes that keep the CV to a single A4 page.
 *
 * The skill asks for body 10–11pt and bullets 9.5–10pt, never below 9pt, and
 * says to condense before shrinking. We only step down as content grows.
 * Sizes are half-points, which is what OOXML expects.
 */
export function densityFor(doc: ParsedDocument): {
  body: number;
  bullet: number;
  name: number;
  section: number;
  lineSpacing: number;
} {
  const weight = doc.totalChars + doc.bulletCount * 40;

  if (weight > 5200) {
    return { body: 20, bullet: 19, name: 26, section: 21, lineSpacing: 240 };
  }
  if (weight > 4200) {
    return { body: 21, bullet: 20, name: 28, section: 22, lineSpacing: 252 };
  }
  return { body: 22, bullet: 20, name: 30, section: 22, lineSpacing: 264 };
}
