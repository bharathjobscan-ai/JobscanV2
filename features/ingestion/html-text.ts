/**
 * HTML → structured plain text.
 *
 * Exists because of a specific defect in real scraped data: the LinkedIn actor
 * emits a `description` field with **no line breaks at all** — headings are
 * glued to body text, "Company DescriptionWise is a global technology company".
 * The structure survives only in `descriptionHtml`, as `<br>` and `<strong>`.
 *
 * Without this, `splitSections` sees one unbroken line, finds no headings, and
 * every job falls back to a single `body` section — which throws away the
 * section weighting the domain filter is built on.
 */

const BLOCK_CLOSE = /<\/(p|div|li|ul|ol|h[1-6]|section|article|tr|blockquote)\s*>/gi;
const BLOCK_OPEN = /<(p|div|h[1-6]|section|article|blockquote)(\s[^>]*)?>/gi;
const LINE_BREAK = /<br\s*\/?>/gi;
const LIST_ITEM = /<li(\s[^>]*)?>/gi;
const ANY_TAG = /<[^>]+>/g;

/** The handful of entities that actually show up in job descriptions. */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
  "&ndash;": "–",
  "&mdash;": "—",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&rdquo;": '"',
  "&ldquo;": '"',
  "&hellip;": "…",
  "&bull;": "•",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&[a-z]+;|&#\d+;/gi, (match) => {
      const named = ENTITIES[match.toLowerCase()];
      if (named) return named;
      const numeric = /^&#(\d+);$/.exec(match);
      return numeric ? String.fromCodePoint(Number(numeric[1])) : match;
    })
    // A double pass catches "&amp;nbsp;", which scrapers produce routinely.
    .replace(/&(amp|lt|gt|quot|nbsp);/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";

  return decodeEntities(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(LINE_BREAK, "\n")
      .replace(LIST_ITEM, "\n- ")
      .replace(BLOCK_CLOSE, "\n")
      .replace(BLOCK_OPEN, "\n")
      .replace(ANY_TAG, ""),
  )
    .replace(/\r/g, "")
    // Trailing spaces would stop `looksLikeHeading` recognising a short line.
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    // Three or more blank lines carry no more meaning than one.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Best available description text.
 *
 * Prefers the HTML because it is the only version with structure. Falls back to
 * the plain field when a source gives no HTML — a section-less description
 * still scores, just as one `body` block.
 */
export function bestDescription(
  html: string | null | undefined,
  plain: string | null | undefined,
): string | null {
  const fromHtml = htmlToText(html);
  if (fromHtml.length > 0) return fromHtml;
  const text = (plain ?? "").trim();
  return text.length > 0 ? text : null;
}
