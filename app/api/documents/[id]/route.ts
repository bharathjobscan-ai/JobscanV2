import { eq } from "drizzle-orm";

import { applicationDocuments, applications, rawJobs } from "@/db/schema";
import { docxFilename, renderDocx } from "@/lib/documents/docx";
import { db } from "@/lib/db/client";

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
  const buffer = await renderDocx(row.doc.contentMd, kind);
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
