#!/usr/bin/env node
/**
 * Generate .docx from the project-management markdown sources.
 *
 * Markdown -> HTML -> .docx via macOS `textutil`, which is built into the OS.
 * No dependency, no cost, and the output opens in both Word and Google Docs.
 *
 * textutil flattens HTML tables into one cell per line, so markdown tables are
 * rendered as indented label/value lines instead — readable when flattened.
 * Genuinely tabular artifacts (backlog, tracker) stay as CSV by design.
 *
 *   npm run pm:docs
 */
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = path.join(process.cwd(), "project-management");
const OUT = path.join(ROOT, "build");

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Inline markdown: `code`, **bold**, *italic*, [text](href). */
function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}

/** Read the current version from the newest CHANGELOG heading. */
async function currentVersion() {
  try {
    const text = await readFile(path.join(ROOT, "CHANGELOG.md"), "utf8");
    return text.match(/^##\s*v([0-9]+\.[0-9]+)/m)?.[1] ?? "0.0";
  } catch {
    return "0.0";
  }
}

function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inList = false;
  let para = [];

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const flush = () => {
    flushPara();
    closeList();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flush();
      out.push("<hr/>");
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length, 4);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    // Markdown table -> label/value lines, because textutil flattens <table>.
    if (/^\|/.test(line)) {
      flushPara();
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^-{2,}$/.test(c.replace(/:/g, "")))) continue;
      closeList();
      out.push(`<p class="row">${cells.map(inline).join(" &nbsp;·&nbsp; ")}</p>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      flushPara();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }

    closeList();
    para.push(line.trim());
  }

  flush();
  return out.join("\n");
}

const STYLE = `
body { font-family: Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.45; }
h1 { font-size: 20pt; margin: 0 0 6pt; }
h2 { font-size: 14pt; margin: 18pt 0 4pt; }
h3 { font-size: 12pt; margin: 12pt 0 3pt; }
h4 { font-size: 11pt; margin: 10pt 0 3pt; }
p  { margin: 0 0 8pt; }
li { margin: 0 0 3pt; }
code { font-family: Menlo, monospace; font-size: 9.5pt; }
p.row { margin: 0 0 3pt; }
`;

async function convert(mdPath, version) {
  const name = path.basename(mdPath, ".md");
  const md = await readFile(mdPath, "utf8");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(name)}</title><style>${STYLE}</style></head>
<body>${markdownToHtml(md)}</body></html>`;

  const tmp = path.join(OUT, `.${name}.html`);
  const docx = path.join(OUT, `${name}-v${version}.docx`);

  await writeFile(tmp, html, "utf8");
  try {
    await run("textutil", ["-convert", "docx", tmp, "-output", docx]);
  } finally {
    await unlink(tmp).catch(() => {});
  }
  return docx;
}

async function findMarkdown(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "build" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await findMarkdown(full)));
    else if (entry.name.endsWith(".md")) files.push(full);
  }
  return files;
}

async function main() {
  if (process.platform !== "darwin") {
    console.error("textutil is macOS-only. The markdown and CSV sources are the");
    console.error("source of truth; .docx generation is a convenience.");
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });
  const version = await currentVersion();
  const files = await findMarkdown(ROOT);

  for (const file of files) {
    const out = await convert(file, version);
    console.log(`  ${path.relative(process.cwd(), out)}`);
  }
  console.log(`\n${files.length} document(s) at v${version}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
