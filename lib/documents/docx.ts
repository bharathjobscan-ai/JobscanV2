import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

import { densityFor, parseDocument, type ParsedDocument } from "./parse";

/**
 * Render a CV or cover letter to .docx.
 *
 * Layout follows the constraints in prompts/cvg/SKILL.md exactly:
 *   - single column, no tables, no columns, no text boxes
 *   - strict one-page A4 for the CV
 *   - body 10-11pt, bullets 9.5-10pt, never below 9pt
 *   - margins 0.5-0.7in
 *   - standard section headers, consistent bullet formatting
 *   - no header/footer on the cover letter
 *
 * Those are ATS rules as much as aesthetic ones: parsers break on multi-column
 * layouts and tables, so the template refuses to produce them.
 */

/** 1 inch = 1440 twips. 0.6in sits mid-range of the 0.5-0.7in the skill allows. */
const MARGIN = 864;
const FONT = "Calibri";

export type DocxKind = "resume" | "cover_letter";

function buildParagraphs(doc: ParsedDocument, kind: DocxKind): Paragraph[] {
  // A cover letter is prose at a fixed comfortable size; a CV is calibrated to
  // fill one page.
  const d =
    kind === "cover_letter"
      ? { body: 22, bullet: 22, name: 26, section: 22, lineSpacing: 276 }
      : densityFor(doc);

  const out: Paragraph[] = [];

  for (const block of doc.blocks) {
    switch (block.kind) {
      case "name":
        out.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: block.text, bold: true, size: d.name, font: FONT }),
            ],
          }),
        );
        break;

      case "contact":
        out.push(
          new Paragraph({
            spacing: { after: 40, line: d.lineSpacing },
            children: [
              new TextRun({ text: block.text, size: d.bullet, font: FONT }),
            ],
          }),
        );
        break;

      case "section":
        out.push(
          new Paragraph({
            spacing: { before: 160, after: 60 },
            // A bottom rule, not a table — tables break ATS parsers.
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999", space: 1 },
            },
            children: [
              new TextRun({
                text: block.text.toUpperCase(),
                bold: true,
                size: d.section,
                font: FONT,
              }),
            ],
          }),
        );
        break;

      case "subsection":
        out.push(
          new Paragraph({
            spacing: { before: 80, after: 30 },
            children: [
              new TextRun({ text: block.text, bold: true, size: d.body, font: FONT }),
            ],
          }),
        );
        break;

      case "bullet":
        out.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 30, line: d.lineSpacing },
            children: [
              new TextRun({ text: block.text, size: d.bullet, font: FONT }),
            ],
          }),
        );
        break;

      case "paragraph":
        out.push(
          new Paragraph({
            spacing: { after: 80, line: d.lineSpacing },
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({ text: block.text, size: d.body, font: FONT }),
            ],
          }),
        );
        break;

      case "rule":
        // Horizontal rules in the draft are section separators we already
        // express through heading borders. Dropping them avoids stray lines.
        break;
    }
  }

  return out;
}

export async function renderDocx(
  markdown: string,
  kind: DocxKind,
): Promise<Buffer> {
  const parsed = parseDocument(markdown);

  const document = new Document({
    creator: "JobScan",
    description: kind === "resume" ? "Tailored CV" : "Cover letter",
    title: parsed.name ?? "Document",
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            // A4 in twips: 11906 x 16838.
            size: { width: 11906, height: 16838 },
            margin: {
              top: MARGIN,
              bottom: MARGIN,
              left: MARGIN,
              right: MARGIN,
            },
          },
        },
        // No headers or footers: the skill forbids them on the cover letter,
        // and ATS parsers frequently drop header/footer content entirely.
        children: buildParagraphs(parsed, kind),
      },
    ],
  });

  return Packer.toBuffer(document);
}

/**
 * Filenames follow the convention in the CVG skill:
 *   CV_Bharath_Raghu_[Company]_[Role]_[YYYYMMDD].docx
 *   CoverLetter_Bharath_Raghu_[Company]_[Role]_[YYYYMMDD].docx
 */
export function docxFilename(input: {
  kind: DocxKind;
  candidate?: string;
  company: string;
  role: string;
  date?: Date;
}): string {
  const token = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "Unknown";

  const date = input.date ?? new Date();
  const stamp =
    `${date.getFullYear()}` +
    `${String(date.getMonth() + 1).padStart(2, "0")}` +
    `${String(date.getDate()).padStart(2, "0")}`;

  const prefix = input.kind === "resume" ? "CV" : "CoverLetter";
  const candidate = token(input.candidate ?? "Bharath Raghu");

  return `${prefix}_${candidate}_${token(input.company)}_${token(input.role)}_${stamp}.docx`;
}
