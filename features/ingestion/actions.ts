"use server";

import { revalidatePath } from "next/cache";

import { ingestRows, type IngestResult } from "./ingest";
import { withRun } from "./runs";
import { parseUploadFile, UploadError } from "./parsers";

export type UploadState = {
  error?: string;
  result?: IngestResult;
};

export async function uploadJobsAction(
  _prev: UploadState,
  data: FormData,
): Promise<UploadState> {
  const file = data.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a .csv, .json or .xlsx file to upload." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = await parseUploadFile(buffer, file.name);

    /**
     * Every upload is a run (JSV2S1158).
     *
     * Uploads previously persisted nothing about themselves — results were
     * reported in-session and then gone. That is fine while someone is
     * watching, and useless afterwards: "which upload brought this job in, and
     * what became of that batch?" had no answer. A manual upload is now
     * recorded exactly as a scheduled fetch is, and gets the same UUID.
     */
    const { result } = await withRun(
      { source: "manual_upload", trigger: "manual_upload", params: { file: file.name } },
      async (run) => {
        const outcome = await ingestRows(rows, { runId: run.id });

        run.count("fetched", rows.length);
        /**
         * `ingestion_runs.inserted` means rows PERSISTED to raw_jobs, which is
         * not what `IngestResult.inserted` means: there it counts rows that
         * landed AND qualified, with screened-out rows tallied separately even
         * though their raw_jobs row was created just the same. Stamping the
         * narrower number made "fetched 10, inserted 1" read as though six jobs
         * had vanished.
         */
        run.count("inserted", outcome.inserted + outcome.screenedOut);
        run.count("duplicates", outcome.duplicate);
        // Rows the validator refused. Derivation cannot see these later —
        // they have no raw_jobs row — which is why they are counted here.
        run.count("rejected", outcome.rejected);
        run.log("persist", "info", `Uploaded ${file.name}`, {
          rows: rows.length,
          inserted: outcome.inserted,
        });

        return outcome;
      },
    );

    revalidatePath("/applications");
    revalidatePath("/pipeline");
    return result ? { result } : { error: "Upload failed." };
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message };
    return {
      error: error instanceof Error ? error.message : "Upload failed.",
    };
  }
}
