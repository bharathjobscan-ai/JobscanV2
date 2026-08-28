import { readFile } from "node:fs/promises";
import path from "node:path";

/** Serves the canonical upload template (JSV2S1031). */
export async function GET() {
  const file = path.join(process.cwd(), "config", "upload-template.csv");

  try {
    const content = await readFile(file, "utf8");
    return new Response(content, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="jobscan-upload-template.csv"',
      },
    });
  } catch {
    return new Response("Template not found", { status: 404 });
  }
}
