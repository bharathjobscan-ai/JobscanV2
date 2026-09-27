/**
 * Trim a stored ScoreG report to the sections the owner reads (2026-09-25).
 *
 * The owner keeps Key Insights and Web Search Evidence and drops Application
 * Strategy and Next Actions. The decision header and the score breakdown are
 * already rendered on the page from the JSON, so the prose copies are dropped
 * too; `SCORE_CONTRACT` told the model not to write them, and it wrote them
 * anyway about half the time.
 *
 * The prompt now asks for the kept sections only. This exists for the reports
 * already stored, and as a backstop for when the model ignores the prompt. It is
 * applied on render, so the stored text is never changed.
 *
 * Pure, so it is tested without a database.
 */

const DROPPED_SECTION =
  /^(decision header|score breakdown|application strategy|next actions|score\s*:)/i;

/** "### 4. Application Strategy" → "Application Strategy". */
function headingText(line: string): string | null {
  const m = line.match(/^#{1,4}\s+(.*)$/);
  if (!m) return null;
  return m[1].replace(/^\d+\.\s*/, "").replace(/\*\*/g, "").trim();
}

export function trimScoreReport(markdown: string): string {
  const out: string[] = [];
  let dropping = false;

  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    // The decision line, as a heading or as a bare first line.
    if (/^\s*(#{1,4}\s+)?\**\s*SCORE\s*:\s*\d{1,3}\s*\/\s*100/i.test(line)) continue;

    const heading = headingText(line);
    if (heading !== null) {
      dropping = DROPPED_SECTION.test(heading);
      // Renumbered sections read as gaps once some are gone ("3. … 6. …").
      if (!dropping) out.push(line.replace(/^(#{1,4}\s+)\d+\.\s*/, "$1"));
      continue;
    }

    if (!dropping) out.push(line);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
