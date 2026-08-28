import ExcelJS from "exceljs";
import Papa from "papaparse";

import { MAX_UPLOAD_BYTES, MAX_UPLOAD_ROWS } from "./schema";

export type UploadFormat = "csv" | "json" | "xlsx";

export class UploadError extends Error {}

export function detectFormat(filename: string): UploadFormat {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv") return "csv";
  if (ext === "json") return "json";
  if (ext === "xlsx" || ext === "xlsm") return "xlsx";
  throw new UploadError(
    `Unsupported file type ".${ext}". Upload a .csv, .json or .xlsx file.`,
  );
}

/**
 * Every format collapses to the same shape — an array of loose records — so
 * validation and dedupe downstream never branch on file type.
 */
export async function parseUploadFile(
  buffer: Buffer,
  filename: string,
): Promise<Record<string, unknown>[]> {
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `File is ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB; the limit is ${
        MAX_UPLOAD_BYTES / 1024 / 1024
      } MB.`,
    );
  }

  const format = detectFormat(filename);
  const rows =
    format === "csv"
      ? parseCsv(buffer)
      : format === "json"
        ? parseJson(buffer)
        : await parseXlsx(buffer);

  if (rows.length === 0) {
    throw new UploadError("No rows found in the uploaded file.");
  }
  if (rows.length > MAX_UPLOAD_ROWS) {
    throw new UploadError(
      `File contains ${rows.length} rows; the limit is ${MAX_UPLOAD_ROWS} per upload.`,
    );
  }
  return rows;
}

function parseCsv(buffer: Buffer): Record<string, unknown>[] {
  const result = Papa.parse<Record<string, unknown>>(
    buffer.toString("utf8").replace(/^﻿/, ""),
    { header: true, skipEmptyLines: "greedy", dynamicTyping: false },
  );

  // Papaparse reports per-row problems without throwing; a malformed row is
  // handled downstream as a rejected row, but a broken header is fatal.
  if (!result.meta.fields || result.meta.fields.length === 0) {
    throw new UploadError("Could not read a header row from the CSV.");
  }
  return result.data.filter((row) =>
    Object.values(row).some((v) => v !== null && v !== undefined && v !== ""),
  );
}

function parseJson(buffer: Buffer): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new UploadError(
      `Invalid JSON: ${error instanceof Error ? error.message : "parse failed"}`,
    );
  }

  // Accept a bare array or { "jobs": [...] }.
  const rows = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && "jobs" in parsed
      ? (parsed as { jobs: unknown }).jobs
      : null;

  if (!Array.isArray(rows)) {
    throw new UploadError(
      'JSON must be an array of job objects, or an object shaped { "jobs": [...] }.',
    );
  }
  return rows.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null && !Array.isArray(row),
  );
}

async function parseXlsx(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs types the arg as its own ArrayBuffer alias; a Node Buffer works.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (error) {
    throw new UploadError(
      `Could not read the workbook: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new UploadError("The workbook has no worksheets.");

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cellValue(cell) ?? "").trim();
  });

  if (headers.filter(Boolean).length === 0) {
    throw new UploadError("Could not read a header row from the first sheet.");
  }

  const rows: Record<string, unknown>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, unknown> = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const header = headers[col];
      if (!header) return;
      const value = cellValue(cell);
      if (value !== null && value !== undefined && value !== "") hasValue = true;
      record[header] = value;
    });
    if (hasValue) rows.push(record);
  });

  return rows;
}

/** Flatten exceljs cell values (hyperlinks, formulas, rich text) to primitives. */
function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("hyperlink" in value && typeof value.hyperlink === "string") {
      return value.hyperlink;
    }
    if ("result" in value) return value.result;
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("error" in value) return undefined;
  }
  return value;
}
