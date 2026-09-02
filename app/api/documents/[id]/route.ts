import { eq } from "drizzle-orm";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { applicationDocuments, applications, rawJobs } from "@/db/schema";
import { docxFilename, renderDocx } from "@/lib/documents/docx";
import type { LetterMeta } from "@/lib/documents/letter";
import { db } from "@/lib/db/client";

/**
 * The candidate header for a cover letter, taken from the master resume.
 *
 * The model no longer writes the name and contact line — the application does,
 * so it must read them from somewhere authoritative. The master resume is that
 * source: its first heading is the name, and the first line carrying an email
 * is the contact line.
 */
async function candidateHeader(): Promise<{ name: string; contact: string }> {
  const fallback = { name: "Bharath Raghu", contact: "" };
  try {
    const md = await readFile(
      path.join(process.cwd(), "prompts", "master-resume.md"),
      "utf8",
    );
    const lines = md.split("\n").map((l) => l.trim());
    const name = lines.find((l) => l.startsWith("# "))?.slice(2).trim();
    const contact = lines.find((l) => l.includes("@") && l.includes("|"));
    return {
      name: name || fallback.name,
      contact: (contact ?? "").replace(/\s+$/, ""),
    };
  } catch {
    return fallback;
  }
}

/**
 * Download a generated document (JSV2S1079).
 *
 * .docx is rendered on demand from the stored markdown rather than persisted:
 * storage stays at zero, and template improvements reach every document ever
 * generated. `?format=md` returns the raw draft.
 *
 * Layout follows the constraints in prompts/cvg/SKILL.md — single column, one
 * page, no tables — which are ATS requirements as much as stylistic ones.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "docx";

  const [row] = await db
    .select({
      doc: applicationDocuments,
      title: rawJobs.title,
      company: rawJobs.company,
      location: rawJobs.location,
    })
    .from(applicationDocuments)
    .innerJoin(applications, eq(applicationDocuments.applicationId, applications.id))
    .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
    .where(eq(applicationDocuments.id, id))
    .limit(1);

  if (!row || !row.doc.contentMd) {
    return new Response("Not found", { status: 404 });
  }

  const slug = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  if (format === "md") {
    return new Response(row.doc.contentMd, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug(row.company)}-${slug(
          row.title,
        )}-${row.doc.docType}-v${row.doc.version}.md"`,
      },
    });
  }

  // The score report is an analysis document, not an application deliverable,
  // so it has no .docx template — markdown is the right shape for it.
  if (row.doc.docType === "score_report") {
    return new Response(row.doc.contentMd, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="ScoreAnalysis_${slug(
          row.company,
        )}_v${row.doc.version}.md"`,
      },
    });
  }

  const kind = row.doc.docType === "resume" ? "resume" : "cover_letter";

  let meta: LetterMeta | undefined;
  if (kind === "cover_letter") {
    const who = await candidateHeader();
    meta = {
      candidateName: who.name,
      candidateContact: who.contact,
      company: row.company,
      role: row.title,
      location: row.location,
      // The letter is dated when it was written, not when it is downloaded.
      date: row.doc.generatedAt ?? undefined,
    };
  }

  const buffer = await renderDocx(row.doc.contentMd, kind, meta);
  const filename = docxFilename({
    kind,
    company: row.company,
    role: row.title,
    date: row.doc.generatedAt ?? undefined,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
