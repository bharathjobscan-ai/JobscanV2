import { eq } from "drizzle-orm";

import { applicationDocuments, rawJobs, applications } from "@/db/schema";
import { DOCUMENT_LABELS } from "@/lib/config/constants";
import { db } from "@/lib/db/client";

/**
 * Download a generated document (JSV2S1079).
 *
 * Markdown, because the PRD defers PDF generation until there is a measurable
 * need. The filename carries company and role so downloads stay identifiable
 * once several are sitting in the same folder.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const filename = `${slug(row.company)}-${slug(row.title)}-${row.doc.docType}-v${row.doc.version}.md`;

  return new Response(row.doc.contentMd, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Document-Label": DOCUMENT_LABELS[row.doc.docType],
    },
  });
}
