import { ExternalHyperlink, TextRun, type ParagraphChild } from "docx";

/**
 * The candidate's public profile links.
 *
 * The master resume writes "LinkedIn" as plain text, which is right for the
 * markdown but leaves a dead word in the .docx. Recruiters click it, so the
 * renderer turns it into a real hyperlink.
 */
export const PROFILE_LINKS: Record<string, string> = {
  linkedin: "https://www.linkedin.com/in/bharathvraghu/",
};

const FONT = "Calibri";
/** Word's own hyperlink blue. */
const LINK_COLOR = "0563C1";

/**
 * Build the runs for a contact line, hyperlinking any known profile word.
 *
 * Splits on the recognised tokens rather than rewriting the string, so the
 * separators and ordering the resume author chose are preserved exactly.
 */
export function contactRuns(
  contact: string,
  size: number,
): ParagraphChild[] {
  const tokens = Object.keys(PROFILE_LINKS);
  const pattern = new RegExp(`\\b(${tokens.join("|")})\\b`, "gi");

  const children: ParagraphChild[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(contact)) !== null) {
    if (match.index > lastIndex) {
      children.push(
        new TextRun({ text: contact.slice(lastIndex, match.index), size, font: FONT }),
      );
    }
    children.push(
      new ExternalHyperlink({
        link: PROFILE_LINKS[match[0].toLowerCase()],
        children: [
          new TextRun({
            text: match[0],
            size,
            font: FONT,
            color: LINK_COLOR,
            underline: {},
          }),
        ],
      }),
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < contact.length) {
    children.push(
      new TextRun({ text: contact.slice(lastIndex), size, font: FONT }),
    );
  }

  return children.length > 0
    ? children
    : [new TextRun({ text: contact, size, font: FONT })];
}
