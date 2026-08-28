import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { detectFormat, parseUploadFile, UploadError } from "@/features/ingestion/parsers";
import { MAX_UPLOAD_ROWS } from "@/features/ingestion/schema";

const CSV = `title,company,source,job_url
Senior Product Manager,Example Ltd,linkedin,https://example.com/1
Product Manager,Another Co,reed,https://example.com/2
`;

describe("detectFormat", () => {
  it.each([
    ["jobs.csv", "csv"],
    ["jobs.CSV", "csv"],
    ["jobs.json", "json"],
    ["jobs.xlsx", "xlsx"],
  ])("maps %s to %s", (name, expected) => {
    expect(detectFormat(name)).toBe(expected);
  });

  it("rejects an unsupported extension", () => {
    expect(() => detectFormat("jobs.pdf")).toThrow(UploadError);
  });
});

describe("parseUploadFile — CSV", () => {
  it("reads rows keyed by header", async () => {
    const rows = await parseUploadFile(Buffer.from(CSV), "jobs.csv");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: "Senior Product Manager",
      company: "Example Ltd",
    });
  });

  it("strips a UTF-8 BOM so the first header still matches", async () => {
    const rows = await parseUploadFile(Buffer.from(`﻿${CSV}`), "jobs.csv");
    expect(Object.keys(rows[0])).toContain("title");
  });

  it("skips blank lines", async () => {
    const rows = await parseUploadFile(Buffer.from(`${CSV}\n\n`), "jobs.csv");
    expect(rows).toHaveLength(2);
  });

  it("rejects an empty file", async () => {
    await expect(parseUploadFile(Buffer.from(""), "jobs.csv")).rejects.toThrow(
      UploadError,
    );
  });
});

describe("parseUploadFile — JSON", () => {
  const job = {
    title: "PM",
    company: "Acme",
    source: "linkedin",
    job_url: "https://example.com/1",
  };

  it("accepts a bare array", async () => {
    const rows = await parseUploadFile(
      Buffer.from(JSON.stringify([job])),
      "jobs.json",
    );
    expect(rows).toHaveLength(1);
  });

  it('accepts { "jobs": [...] }', async () => {
    const rows = await parseUploadFile(
      Buffer.from(JSON.stringify({ jobs: [job, job] })),
      "jobs.json",
    );
    expect(rows).toHaveLength(2);
  });

  it("reports invalid JSON clearly", async () => {
    await expect(
      parseUploadFile(Buffer.from("{ not json"), "jobs.json"),
    ).rejects.toThrow(UploadError);
  });

  it("rejects a shape that is neither array nor { jobs }", async () => {
    await expect(
      parseUploadFile(Buffer.from(JSON.stringify(job)), "jobs.json"),
    ).rejects.toThrow(UploadError);
  });
});

describe("parseUploadFile — XLSX", () => {
  async function workbook(
    rows: (string | number | Date | null)[][],
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Jobs");
    rows.forEach((row) => sheet.addRow(row));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it("reads the first sheet keyed by header", async () => {
    const buffer = await workbook([
      ["title", "company", "source", "job_url"],
      ["PM", "Acme", "linkedin", "https://example.com/1"],
    ]);
    const rows = await parseUploadFile(buffer, "jobs.xlsx");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "PM", company: "Acme" });
  });

  it("returns date cells as Date objects for the row parser to normalise", async () => {
    const buffer = await workbook([
      ["title", "posted_at"],
      ["PM", new Date("2026-08-20T00:00:00Z")],
    ]);
    const rows = await parseUploadFile(buffer, "jobs.xlsx");
    expect(rows[0].posted_at).toBeInstanceOf(Date);
  });

  it("rejects a workbook with no header row", async () => {
    const buffer = await workbook([[null, null]]);
    await expect(parseUploadFile(buffer, "jobs.xlsx")).rejects.toThrow(UploadError);
  });
});

describe("guardrails", () => {
  it("refuses a file over the row limit", async () => {
    const header = "title,company,source,job_url\n";
    const row = "PM,Acme,linkedin,https://example.com/1\n";
    const csv = header + row.repeat(MAX_UPLOAD_ROWS + 1);
    await expect(parseUploadFile(Buffer.from(csv), "jobs.csv")).rejects.toThrow(
      /limit is 500/,
    );
  });

  it("refuses a file over the size limit", async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, "a");
    await expect(parseUploadFile(big, "jobs.csv")).rejects.toThrow(/limit is 5/);
  });
});
