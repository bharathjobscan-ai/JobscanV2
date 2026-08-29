import { Fragment, type ReactNode } from "react";

/**
 * Minimal markdown renderer for generated documents.
 *
 * Deliberately not a dependency: the generated resumes, cover letters and score
 * reports use a small, known subset of markdown, and building React elements
 * directly means no dangerouslySetInnerHTML and therefore no HTML-injection
 * surface from model output.
 *
 * Score reports lean on tables and on gap/strength language, so both get real
 * treatment here rather than collapsing into flat grey text.
 */

/** Colour a section by what it means, so gaps and risks read at a glance. */
type Tone = "neutral" | "positive" | "negative" | "warning";

const POSITIVE = /\b(strength|advantage|match|evidence|pass|proceed|recommend)/i;
const NEGATIVE = /\b(gap|risk|weakness|missing|blocker|reject|concern|fail)/i;
const WARNING = /\b(caveat|caution|unverified|assumption|watch|limitation|unknown)/i;

function toneOf(text: string): Tone {
  if (NEGATIVE.test(text)) return "negative";
  if (WARNING.test(text)) return "warning";
  if (POSITIVE.test(text)) return "positive";
  return "neutral";
}

const HEADING_TONE: Record<Tone, string> = {
  neutral: "text-foreground border-line",
  positive: "text-positive border-positive/40",
  negative: "text-negative border-negative/40",
  warning: "text-warning border-warning/40",
};

const BULLET_MARKER: Record<Tone, string> = {
  neutral: "before:bg-subtle",
  positive: "before:bg-positive",
  negative: "before:bg-negative",
  warning: "before:bg-warning",
};

/** Inline: **bold**, *italic*, `code`, [text](href), and bare scores like 82/100. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\b\d{1,3}\s*\/\s*\d{2,3}\b)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${index++}`;

    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-surface-muted px-1 py-0.5 text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (/^\d/.test(token)) {
      // A score like 45/50 — worth making scannable.
      nodes.push(
        <span key={key} className="font-medium tabular-nums text-foreground">
          {token}
        </span>,
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const isDivider = (line: string) =>
  /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  let listItems: string[] = [];
  let paragraph: string[] = [];
  let sectionTone: Tone = "neutral";

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = [...listItems];
    const key = blocks.length;
    blocks.push(
      <ul key={`ul-${key}`} className="my-1.5 flex flex-col gap-1">
        {items.map((item, i) => {
          const tone = sectionTone === "neutral" ? toneOf(item) : sectionTone;
          return (
            <li
              key={i}
              className={`relative pl-4 before:absolute before:left-0 before:top-[0.5em] before:h-1.5 before:w-1.5 before:rounded-full ${BULLET_MARKER[tone]}`}
            >
              {inline(item, `ul${key}-${i}`)}
            </li>
          );
        })}
      </ul>,
    );
    listItems = [];
  };

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ");
    const key = blocks.length;
    blocks.push(<p key={`p-${key}`}>{inline(text, `p${key}`)}</p>);
    paragraph = [];
  };

  const flush = () => {
    flushList();
    flushParagraph();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    if (!line.trim()) {
      flush();
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flush();
      blocks.push(<hr key={`hr-${blocks.length}`} />);
      continue;
    }

    // ---- Table -------------------------------------------------------------
    if (line.trim().startsWith("|") && isDivider(lines[i + 1] ?? "")) {
      flush();
      const header = splitRow(line);
      const rows: string[][] = [];
      let cursor = i + 2;
      while (cursor < lines.length && lines[cursor].trim().startsWith("|")) {
        rows.push(splitRow(lines[cursor]));
        cursor++;
      }
      const key = blocks.length;
      blocks.push(
        <div key={`t-${key}`} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {header.map((cell, c) => (
                  <th
                    key={c}
                    className="border-b border-line-strong bg-surface-muted px-2 py-1.5 text-left font-semibold"
                  >
                    {inline(cell, `th${key}-${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="border-b border-line last:border-0">
                  {row.map((cell, c) => {
                    const tone = toneOf(cell);
                    return (
                      <td
                        key={c}
                        className={`px-2 py-1.5 align-top ${
                          tone === "negative"
                            ? "text-negative"
                            : tone === "positive"
                              ? "text-positive"
                              : tone === "warning"
                                ? "text-warning"
                                : ""
                        }`}
                      >
                        {inline(cell, `td${key}-${r}-${c}`)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      i = cursor - 1;
      continue;
    }

    // ---- Heading -----------------------------------------------------------
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      const text = heading[2];
      sectionTone = toneOf(text);
      const key = blocks.length;
      const cls = HEADING_TONE[sectionTone];
      const children = inline(text, `h${key}`);

      blocks.push(
        level === 1 ? (
          <h1 key={`h-${key}`} className={cls}>
            {children}
          </h1>
        ) : level === 2 ? (
          <h2 key={`h-${key}`} className={cls}>
            {children}
          </h2>
        ) : (
          <h3 key={`h-${key}`} className={cls}>
            {children}
          </h3>
        ),
      );
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      listItems.push(bullet[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flush();

  return (
    <div className="prose-doc text-sm">
      {blocks.map((block, i) => (
        <Fragment key={i}>{block}</Fragment>
      ))}
    </div>
  );
}
