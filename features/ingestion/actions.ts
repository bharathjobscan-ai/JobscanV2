"use server";

import { revalidatePath } from "next/cache";

import { ingestRows, type IngestResult } from "./ingest";
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
    const result = await ingestRows(rows);

    revalidatePath("/applications");
    return { result };
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message };
    return {
      error: error instanceof Error ? error.message : "Upload failed.",
    };
  }
}
