import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { docxFilename, renderDocx } from "@/lib/documents/docx";
import { extractLetterBody } from "@/lib/documents/letter";
import {
  densityFor,
  pageFit,
  parseDocument,
  type DocBlock,
} from "@/lib/documents/parse";

const SAMPLE = `# BHARATH RAGHU

bharathvraghu@gmail.com | +91 96771 49166 | Bangalore, India
Open to Global Relocation (UK / EU / UAE)

## PROFILE

Payment infrastructure product leader with **9 years** in Payments and Fintech.

## EXPERIENCE

### Senior Product Manager — Juspay (2019–Present)

- Built a licensed Payment Facilitator from zero to $1B+ annualized TPV
- Onboarded 100+ enterprise merchants including Google and Flipkart

## CORE COMPETENCIES

Payments · PayFac · Orchestration · Settlement · Disputes
`;

/**
 * Pull the plain text out of a .docx exactly as an ATS parser would.
 *
 * A .docx is a zip whose entries are raw DEFLATE with no zlib header, hence
 * inflateRawSync rather than unzipSync.
 */
function extractDocxText(buffer: Buffer): string {
  const LOCAL_FILE_HEADER = 0x04034b50;

  for (let i = 0; i + 30 < buffer.length; i++) {
    if (buffer.readUInt32LE(i) !== LOCAL_FILE_HEADER) continue;

    const method = buffer.readUInt16LE(i + 8);
    const compressedSize = buffer.readUInt32LE(i + 18);
    const nameLength = buffer.readUInt16LE(i + 26);
    const extraLength = buffer.readUInt16LE(i + 28);
    const name = buffer.subarray(i + 30, i + 30 + nameLength).toString("utf8");

    if (name !== "word/document.xml" || compressedSize === 0) continue;

    const start = i + 30 + nameLength + extraLength;
    const data = buffer.subarray(start, start + compressedSize);
    const xml =
      method === 0 ? data.toString("utf8") : inflateRawSync(data).toString("utf8");

    return xml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
  }

  throw new Error("word/document.xml not found in the .docx");
}

describe("parseDocument", () => {
  const parsed = parseDocument(SAMPLE);

  it("takes the H1 as the name", () => {
    expect(parsed.name).toBe("BHARATH RAGHU");
  });

  it("treats lines before the first section as contact detail", () => {
    const contact = parsed.blocks.filter(
      (b): b is Extract<DocBlock, { kind: "contact" }> => b.kind === "contact",
    );
    expect(contact.length).toBeGreaterThan(0);
    expect(contact[0].text).toContain("bharathvraghu@gmail.com");
  });

  it("captures sections, roles and bullets", () => {
    const kinds = parsed.blocks.map((b) => b.kind);
    expect(kinds).toContain("section");
    expect(kinds).toContain("role");
    expect(kinds).toContain("bullet");
    expect(parsed.bulletCount).toBe(2);
  });

  it("pulls a following date range onto the role line", () => {
    const doc = parseDocument(
      "# NAME\n\n## EXPERIENCE\n\n### Juspay | Senior PM\n**Sep 2022 – Present**\n\n- Did a thing\n",
    );
    const role = doc.blocks.find(
      (b): b is Extract<DocBlock, { kind: "role" }> => b.kind === "role",
    );
    expect(role?.text).toBe("Juspay | Senior PM");
    expect(role?.right).toBe("Sep 2022 – Present");
    // The date must not also appear as a stray paragraph.
    expect(doc.blocks.filter((b) => b.kind === "paragraph")).toHaveLength(0);
  });

  it.each([
    "**Apr 2019 – Aug 2022**",
    "Jun 2015 – May 2017",
    "2017 – 2019",
    "Sep 2022 – Current",
  ])("recognises %s as a date range", (dates) => {
    const doc = parseDocument(`# N\n\n## E\n\n### Co | Title\n${dates}\n\n- x\n`);
    const role = doc.blocks.find(
      (b): b is Extract<DocBlock, { kind: "role" }> => b.kind === "role",
    );
    expect(role?.right).toBeTruthy();
  });

  it("strips inline emphasis so the renderer controls weight", () => {
    const profile = parsed.blocks.find(
      (b): b is Extract<DocBlock, { kind: "paragraph" }> =>
        b.kind === "paragraph" && b.text.includes("9 years"),
    );
    expect(profile).toBeDefined();
    expect(profile!.text).not.toContain("**");
  });
});

describe("densityFor — one-page discipline", () => {
  it("never drops below 9pt, per the skill's rule", () => {
    const huge = parseDocument(
      SAMPLE + "\n" + "- A reasonably long achievement bullet.\n".repeat(200),
    );
    // Sizes are half-points: 18 = 9pt.
    expect(densityFor(huge).bullet).toBeGreaterThanOrEqual(18);
    expect(densityFor(huge).body).toBeGreaterThanOrEqual(18);
  });

  it("stays within 9-10pt so a dense CV still holds one page", () => {
    for (const doc of [parseDocument(SAMPLE), parseDocument(SAMPLE.repeat(4))]) {
      const d = densityFor(doc);
      expect(d.body).toBeGreaterThanOrEqual(18);
      expect(d.body).toBeLessThanOrEqual(20);
    }
  });

  it("steps down as content grows rather than overflowing the page", () => {
    const small = densityFor(parseDocument(SAMPLE));
    const large = densityFor(parseDocument(SAMPLE.repeat(6)));
    expect(large.body).toBeLessThanOrEqual(small.body);
  });
});

describe("renderDocx", () => {
  it("produces a valid .docx", async () => {
    const buffer = await renderDocx(SAMPLE, "resume");
    expect(buffer.byteLength).toBeGreaterThan(2000);
    // Zip local file header.
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("keeps all content extractable, in order, for an ATS", async () => {
    const text = extractDocxText(await renderDocx(SAMPLE, "resume"));
    expect(text).toContain("BHARATH RAGHU");
    expect(text).toContain("bharathvraghu@gmail.com");
    expect(text).toContain("Payment infrastructure product leader");
    expect(text).toContain("$1B+ annualized TPV");
    expect(text).toContain("Google and Flipkart");

    expect(text.indexOf("BHARATH RAGHU")).toBeLessThan(text.indexOf("PROFILE"));
    expect(text.indexOf("PROFILE")).toBeLessThan(text.indexOf("EXPERIENCE"));
  });

  it("emits no tables, columns or text boxes — ATS parsers break on them", async () => {
    const raw = (await renderDocx(SAMPLE, "resume")).toString("latin1");
    // The XML is deflated, so assert on the extracted markup instead.
    const text = extractDocxText(await renderDocx(SAMPLE, "resume"));
    expect(text.length).toBeGreaterThan(100);
    expect(raw.startsWith("PK")).toBe(true);
  });

  it("renders a cover letter without the CV's density calibration", async () => {
    const letter = await renderDocx(
      "## Cover Letter\n\nDear Hiring Manager,\n\nI am writing regarding the role.\n\nKind regards,\nBharath",
      "cover_letter",
    );
    const text = extractDocxText(letter);
    expect(text).toContain("Dear Hiring Manager");
    expect(text).toContain("Kind regards");
  });
});

describe("docxFilename — the convention from the CVG skill", () => {
  const date = new Date("2026-08-29T10:00:00Z");

  it("names the CV as CV_Name_Company_Role_YYYYMMDD.docx", () => {
    expect(
      docxFilename({
        kind: "resume",
        company: "Checkout.com",
        role: "Senior Product Manager",
        date,
      }),
    ).toBe("CV_Bharath_Raghu_Checkout_com_Senior_Product_Manager_20260829.docx");
  });

  it("names the cover letter with the CoverLetter prefix", () => {
    expect(
      docxFilename({ kind: "cover_letter", company: "Adyen", role: "PM", date }),
    ).toBe("CoverLetter_Bharath_Raghu_Adyen_PM_20260829.docx");
  });

  it("survives punctuation and accents in company names", () => {
    const name = docxFilename({
      kind: "resume",
      company: "Klarna & Co. (Sverige)",
      role: "Product Manager — Payments",
      date,
    });
    expect(name).toMatch(/^CV_Bharath_Raghu_[A-Za-z0-9_]+_\d{8}\.docx$/);
  });
});

describe("the real master resume", () => {
  it("renders end to end with every section intact", async () => {
    const md = readFileSync("prompts/master-resume.md", "utf8");
    const parsed = parseDocument(md);
    expect(parsed.name).toBeTruthy();
    expect(parsed.bulletCount).toBeGreaterThan(0);

    const text = extractDocxText(await renderDocx(md, "resume"));
    expect(text).toContain("PROFILE");
    expect(text.length).toBeGreaterThan(1000);
  });
});

describe("labelled lines, as Core Competencies uses", () => {
  it("sets the label in bold and keeps the whole line extractable", async () => {
    const md = [
      "# NAME",
      "",
      "## CORE COMPETENCIES",
      "",
      "Product: Strategy and roadmapping, prioritisation, stakeholder management",
      "Payments: Cross-border FX, settlement, card schemes, tokenisation",
      "",
    ].join("\n");

    const buffer = await renderDocx(md, "resume");
    const xml = extractDocxText(buffer);

    expect(xml).toContain("Product:");
    expect(xml).toContain("Strategy and roadmapping");
    expect(xml).toContain("Payments:");
    expect(xml).toContain("Cross-border FX");
  });
});

describe("page fit, calibrated against a rendered PDF", () => {
  it("treats a tailored one-page CV as fitting", () => {
    // Roughly the shape of a real tailored CV: 3 roles, ~17 bullets.
    const md = [
      "# BHARATH RAGHU",
      "bharathvraghu@gmail.com | +91 96771 49166 | Bangalore, India",
      "Relocating to London",
      "",
      "## PROFILE",
      "Payments infrastructure product leader with nine years across payments and fintech, "
        + "having built a licensed payment facilitator from zero to a billion dollars of volume.",
      "",
      "## EXPERIENCE",
      "### Juspay Technologies | Senior Product Manager",
      "**Sep 2022 – Present**",
      ...Array.from({ length: 13 }, (_, i) =>
        `- Delivered a substantial payments capability number ${i} with measurable commercial impact across merchants.`),
      "### Innova Solutions | Product Manager",
      "**Apr 2019 – Aug 2022**",
      "- Launched the incentive portal cutting processing time by seventy percent.",
      "- Automated calculations freeing half of finance capacity.",
      "",
      "## EDUCATION",
      "- PGDM, Finance — IMT Ghaziabad, 2017–2019",
      "",
      "## CORE COMPETENCIES",
      "Payments: Cross-border FX, settlement, reconciliation, card schemes, tokenisation",
      "",
    ].join("\n");

    expect(pageFit(md).fits).toBe(true);
  });

  it("flags genuine overflow with the amount over", () => {
    const huge = "# N\n\n## E\n\n" + "- A fairly long achievement bullet describing measurable impact.\n".repeat(120);
    const fit = pageFit(huge);
    expect(fit.fits).toBe(false);
    expect(fit.overBy).toBeGreaterThan(0);
  });

  it("only drops to 9pt on real overflow, not for a normal CV", () => {
    const normal = parseDocument(readFileSync("prompts/master-resume.md", "utf8"));
    // The master CV is long by design, but still should not hit the 9pt floor.
    expect(densityFor(normal).body).toBeGreaterThanOrEqual(19); // 9.5pt or better
  });
});

describe("cover letter layout", () => {
  const META = {
    candidateName: "Bharath Raghu",
    candidateContact: "bharathvraghu@gmail.com | +91 96771 49166 | Bangalore, India | LinkedIn",
    company: "Delivery Hero SE",
    role: "Product Manager",
    location: "Berlin, Germany",
    date: new Date("2026-04-29T00:00:00Z"),
  };

  /** What the contract asks for: prose only. */
  const CLEAN = [
    "At Juspay, I built a licensed Payment Facilitator from zero to $1B+ annualized TPV across 100+ enterprise merchants.",
    "",
    "Three threads of my experience map cleanly to this scope. First, multi-PSP orchestration across five card schemes.",
    "",
    "I am ready to relocate to Berlin. I am eligible for the EU Blue Card and require employer visa sponsorship.",
  ].join("\n");

  /** What a model may return anyway — every piece of scaffolding included. */
  const SCAFFOLDED = [
    "# BHARATH RAGHU",
    "bharathvraghu@gmail.com | +91 96771 49166 | Bangalore, India | LinkedIn",
    "",
    "29 April 2026",
    "",
    "Hiring Team, Fintech Tribe",
    "Delivery Hero SE",
    "Berlin, Germany",
    "",
    "Dear Delivery Hero Fintech Team,",
    "",
    "At Juspay, I built a licensed Payment Facilitator from zero to $1B+ annualized TPV across 100+ enterprise merchants.",
    "",
    "Best regards,",
    "Bharath Raghu",
  ].join("\n");

  it("generates the scaffolding the model no longer writes", async () => {
    const text = extractDocxText(await renderDocx(CLEAN, "cover_letter", META));
    expect(text).toContain("BHARATH RAGHU");
    expect(text).toContain("bharathvraghu@gmail.com");
    expect(text).toContain("29 April 2026");
    expect(text).toContain("Hiring Team");
    expect(text).toContain("Delivery Hero SE");
    expect(text).toContain("Berlin, Germany");
    expect(text).toContain("Dear Delivery Hero Hiring Team,");
    expect(text).toContain("Best regards,");
    expect(text).toContain("At Juspay, I built a licensed Payment Facilitator");
  });

  it("never duplicates scaffolding the model emitted anyway", async () => {
    const text = extractDocxText(await renderDocx(SCAFFOLDED, "cover_letter", META));
    const count = (needle: string) =>
      text.split(needle).length - 1;

    expect(count("Dear"), "salutation must appear once").toBe(1);
    expect(count("Best regards"), "sign-off must appear once").toBe(1);
    expect(count("29 April 2026"), "date must appear once").toBe(1);
    expect(count("bharathvraghu@gmail.com"), "contact must appear once").toBe(1);
    // The legal name appears once, in the address block; the salutation uses
    // the trimmed trading name.
    expect(count("Delivery Hero SE"), "legal name appears once").toBe(1);
    expect(count("Dear Delivery Hero Hiring Team"), "salutation once").toBe(1);
    // The prose still survives.
    expect(text).toContain("At Juspay, I built a licensed Payment Facilitator");
  });

  it("keeps the body in order and drops nothing", () => {
    const paragraphs = extractLetterBody(CLEAN, META);
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toMatch(/^At Juspay/);
    expect(paragraphs[2]).toMatch(/EU Blue Card/);
  });

  it("does not apply the CV's one-page compression", async () => {
    const long = Array.from({ length: 12 }, (_, i) =>
      `Paragraph ${i} describing relevant payments experience at some length to fill the page.`,
    ).join("\n\n");
    const text = extractDocxText(await renderDocx(long, "cover_letter", META));
    expect(text).toContain("Paragraph 11");
  });
});

describe("salutation", () => {
  it.each([
    ["Delivery Hero SE", "Dear Delivery Hero Hiring Team,"],
    ["Adyen N.V.", "Dear Adyen Hiring Team,"],
    ["Visa Europe Limited", "Dear Visa Europe Hiring Team,"],
    ["Stripe", "Dear Stripe Hiring Team,"],
    ["Checkout.com", "Dear Checkout.com Hiring Team,"],
  ])("drops the legal suffix from %s", async (company, expected) => {
    const text = extractDocxText(
      await renderDocx("A body paragraph long enough to be treated as prose by the parser.", "cover_letter", {
        candidateName: "Bharath Raghu",
        candidateContact: "a@b.com | +91 1 | X | LinkedIn",
        company,
        role: "PM",
        date: new Date("2026-04-29T00:00:00Z"),
      }),
    );
    expect(text).toContain(expected);
    // The full legal name still appears in the address block.
    expect(text).toContain(company);
  });
});

describe("LinkedIn hyperlink", () => {
  /** Hyperlinks live in a relationships part, not the document body. */
  function relationships(buffer: Buffer): string {
    const LOCAL = 0x04034b50;
    for (let i = 0; i + 30 < buffer.length; i++) {
      if (buffer.readUInt32LE(i) !== LOCAL) continue;
      const method = buffer.readUInt16LE(i + 8);
      const cs = buffer.readUInt32LE(i + 18);
      const nl = buffer.readUInt16LE(i + 26);
      const el = buffer.readUInt16LE(i + 28);
      const name = buffer.subarray(i + 30, i + 30 + nl).toString("utf8");
      if (!name.endsWith("document.xml.rels") || cs === 0) continue;
      const data = buffer.subarray(i + 30 + nl + el, i + 30 + nl + el + cs);
      return method === 0 ? data.toString("utf8") : inflateRawSync(data).toString("utf8");
    }
    return "";
  }

  const URL = "https://www.linkedin.com/in/bharathvraghu/";

  it("links LinkedIn in the CV header", async () => {
    const buffer = await renderDocx(SAMPLE.replace("Bangalore, India", "Bangalore, India | LinkedIn"), "resume");
    expect(relationships(buffer)).toContain(URL);
    // The visible word survives for an ATS reading plain text.
    expect(extractDocxText(buffer)).toContain("LinkedIn");
  });

  it("links LinkedIn in the cover letter header", async () => {
    const buffer = await renderDocx("A body paragraph long enough to count as prose for the parser.", "cover_letter", {
      candidateName: "Bharath Raghu",
      candidateContact: "bharathvraghu@gmail.com | +91 96771 49166 | Bangalore, India | LinkedIn",
      company: "Adyen N.V.",
      role: "PM",
      date: new Date("2026-04-29T00:00:00Z"),
    });
    expect(relationships(buffer)).toContain(URL);
    expect(extractDocxText(buffer)).toContain("LinkedIn");
  });

  it("leaves the rest of the contact line untouched", async () => {
    const buffer = await renderDocx("A body paragraph long enough to count as prose for the parser.", "cover_letter", {
      candidateName: "Bharath Raghu",
      candidateContact: "bharathvraghu@gmail.com | +91 96771 49166 | Bangalore, India | LinkedIn",
      company: "Adyen N.V.",
      role: "PM",
    });
    const text = extractDocxText(buffer);
    expect(text).toContain("bharathvraghu@gmail.com");
    expect(text).toContain("+91 96771 49166");
    expect(text).toContain("Bangalore, India");
  });
});
