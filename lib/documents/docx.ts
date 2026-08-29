import {
  AlignmentType,
  BorderStyle,
  Document,
  LineRuleType,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";

import { densityFor, parseDocument, type Density, type ParsedDocument } from "./parse";

/**
 * Render a CV or cover letter to .docx.
 *
 * Layout follows the constraints in prompts/cvg/SKILL.md and matches the
 * house style of the reference CVs: centred header, coloured section headings
 * with a rule beneath, company and title on one line with dates set flush
 * right, and tight bullet spacing so a dense CV still holds one A4 page.
 *
 * Single column, no tables, no text boxes and no header/footer throughout —
 * those are ATS requirements as much as stylistic ones, since parsers drop or
 * scramble all four.
 */

/** 1 inch = 1440 twips. 0.5in is the tight end of the skill's 0.5-0.7in range. */
const MARGIN = 720;
const PAGE_WIDTH = 11906; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FONT = "Calibri";
/** Section headings, matching the reference CVs. */
const ACCENT = "1F3864";

export type DocxKind = "resume" | "cover_letter";

/**
 * Split a "Label: value" line, as Core Competencies uses.
 *
 * The reference CVs set the label bold so the categories are scannable; the
 * whole line in one weight reads as a wall of text.
 */
const LABELLED = /^([A-Z][A-Za-z0-9 &/,'-]{1,44}):\s+(.*)$/;

function headerBlock(text: string, d: Density, italic = false): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 20, line: d.lineSpacing, lineRule: LineRuleType.AUTO },
    children: [
      new TextRun({ text, size: d.bullet, font: FONT, italics: italic }),
    ],
  });
}

function buildParagraphs(doc: ParsedDocument, kind: DocxKind): Paragraph[] {
  const d =
    kind === "cover_letter"
      ? {
          body: 21, bullet: 21, name: 26, section: 21,
          lineSpacing: 250, bulletSpacing: 60, sectionBefore: 140,
        }
      : densityFor(doc);

  const out: Paragraph[] = [];
  let headerLine = 0;

  for (const block of doc.blocks) {
    switch (block.kind) {
      case "name":
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 30 },
            children: [
              new TextRun({
                text: block.text.toUpperCase(),
                bold: true,
                size: d.name,
                font: FONT,
                color: ACCENT,
              }),
            ],
          }),
        );
        break;

      case "contact":
        // First header line is contact detail; anything after is the work
        // authorisation line, which the reference CVs set in italic.
        out.push(headerBlock(block.text, d, headerLine > 0));
        headerLine += 1;
        break;

      case "section":
        out.push(
          new Paragraph({
            spacing: { before: d.sectionBefore, after: 40 },
            // A bottom rule, not a table — tables break ATS parsers.
            border: {
              bottom: {
                style: BorderStyle.SINGLE,
                size: 6,
                color: ACCENT,
                space: 1,
              },
            },
            children: [
              new TextRun({
                text: block.text.toUpperCase(),
                bold: true,
                size: d.section,
                font: FONT,
                color: ACCENT,
              }),
            ],
          }),
        );
        break;

      case "role": {
        // Company/title left, dates flush right on one line via a tab stop.
        const children = [
          new TextRun({ text: block.text, bold: true, size: d.body, font: FONT }),
        ];
        if (block.right) {
          children.push(
            new TextRun({ text: "\t", size: d.body, font: FONT }),
            new TextRun({
              text: block.right,
              italics: true,
              size: d.bullet,
              font: FONT,
            }),
          );
        }
        out.push(
          new Paragraph({
            spacing: { before: 60, after: 20 },
            tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
            children,
          }),
        );
        break;
      }

      case "subsection":
        out.push(
          new Paragraph({
            spacing: { before: 30, after: 20 },
            children: [
              new TextRun({
                text: block.text,
                italics: true,
                size: d.bullet,
                font: FONT,
                color: ACCENT,
              }),
            ],
          }),
        );
        break;

      case "bullet":
        out.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: {
              after: d.bulletSpacing,
              line: d.lineSpacing,
              lineRule: LineRuleType.AUTO,
            },
            children: [
              new TextRun({ text: block.text, size: d.bullet, font: FONT }),
            ],
          }),
        );
        break;

      case "paragraph": {
        const labelled = block.text.match(LABELLED);
        const children = labelled
          ? [
              new TextRun({
                text: `${labelled[1]}: `,
                bold: true,
                size: d.body,
                font: FONT,
              }),
              new TextRun({ text: labelled[2], size: d.body, font: FONT }),
            ]
          : [new TextRun({ text: block.text, size: d.body, font: FONT })];

        out.push(
          new Paragraph({
            spacing: {
              after: d.bulletSpacing + 10,
              line: d.lineSpacing,
              lineRule: LineRuleType.AUTO,
            },
            alignment: AlignmentType.LEFT,
            children,
          }),
        );
        break;
      }

      case "rule":
        // Separators are already expressed through section heading borders.
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
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: 16838 },
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
