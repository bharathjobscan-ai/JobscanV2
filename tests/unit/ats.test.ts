import { describe, expect, it } from "vitest";

import { applyAtsHygiene } from "@/lib/documents/ats";
import { PROFILE_LINKS } from "@/lib/documents/contact";

/**
 * JSV2S1057. Every case here is a fault SimG's ATS lens actually reported on a
 * generated CV, which is why they are repaired in code rather than asked for in
 * the prompt.
 */
describe("applyAtsHygiene", () => {
  const header = "# Bharath Raghu\nbharath@example.com\n\n## Profile\n";

  it("collapses runs of spaces inside a line and strips trailing ones", () => {
    const { markdown, report } = applyAtsHygiene(
      `${header}- Led  the  corridor  rebuild.   \n`,
    );
    expect(markdown).toContain("- Led the corridor rebuild.");
    expect(markdown).not.toMatch(/ {2}/);
    expect(report.repairs.find((r) => r.code === "whitespace")?.count).toBe(1);
  });

  it("rewrites any LinkedIn reference to the canonical URL", () => {
    for (const broken of [
      "linkedin.com/in/bharathvraghu",
      "https:// www.linkedin.com/in/bharathvraghu/",
      "[LinkedIn](www.linkedin.com/in/bharathvraghu)",
      "https://linkedin.com/in/bharathvraghu/",
    ]) {
      const { markdown } = applyAtsHygiene(
        `# Bharath Raghu\nbharath@example.com · ${broken}\n\n## Profile\nx\n`,
      );
      expect(markdown).toContain(PROFILE_LINKS.linkedin);
    }
  });

  it("does not consume the whitespace around the URL", () => {
    // Regression: the first version padded the pattern with \s* on both ends and
    // swallowed the blank line after the contact block, welding it to the next
    // heading. The document structure must survive the repair.
    const { markdown } = applyAtsHygiene(
      "# Bharath Raghu\nbharath@example.com · linkedin.com/in/bharathvraghu\n\n## Profile\nx\n",
    );
    expect(markdown).toContain(`· ${PROFILE_LINKS.linkedin}`);
    expect(markdown).toContain("\n\n## Profile");
    expect(markdown).not.toMatch(/\/## Profile/);
  });

  it("never rewrites someone else's profile in the body", () => {
    // Regression: a cover letter naming a referrer had their profile rewritten
    // to the candidate's own, and the closing parenthesis eaten with it.
    const letter =
      "# Bharath Raghu\nbharath@example.com\n\n## Profile\n" +
      "Referred by Priya Menon (linkedin.com/in/priyamenon), Director of Product.\n";
    const { markdown, report } = applyAtsHygiene(letter);
    expect(markdown).toContain("(linkedin.com/in/priyamenon), Director of Product.");
    expect(markdown).not.toContain("priyamenon\u0029".replace("\u0029", "") + "bharath");
    expect(report.repairs.some((r) => r.code === "profile_url")).toBe(false);
  });

  it("canonicalises a mistyped slug in the header", () => {
    const { markdown } = applyAtsHygiene(
      "# Bharath Raghu\nbharath@example.com · linkedin.com/in/bharath-raghu-99\n\n## Profile\nx\n",
    );
    expect(markdown).toContain(PROFILE_LINKS.linkedin);
    expect(markdown).not.toContain("bharath-raghu-99");
  });

  it("leaves a URL that is already canonical alone, and reports no repair", () => {
    const { report } = applyAtsHygiene(
      `# Bharath Raghu\nbharath@example.com · ${PROFILE_LINKS.linkedin}\n\n## Profile\nx\n`,
    );
    expect(report.repairs.some((r) => r.code === "profile_url")).toBe(false);
  });

  it("converts glyph bullets and strips zero-width characters", () => {
    const { markdown, report } = applyAtsHygiene(
      `${header}• Ran the​ payouts programme.\n`,
    );
    expect(markdown).toContain("- Ran the payouts programme.");
    expect(report.repairs.map((r) => r.code)).toEqual(
      expect.arrayContaining(["bullet_glyphs", "invisible_characters"]),
    );
  });

  it("normalises curly quotes to ASCII", () => {
    const { markdown } = applyAtsHygiene(`${header}Ran the “first” wave…\n`);
    expect(markdown).toContain('Ran the "first" wave...');
  });

  it("keeps en and em dashes, which the .docx date parser depends on", () => {
    const { markdown } = applyAtsHygiene(
      "# Bharath Raghu\nbharath@example.com\n\n## Experience\n### Juspay\nSep 2022 – Present\n",
    );
    expect(markdown).toContain("Sep 2022 – Present");
  });

  it("flags a table rather than deleting it, and penalises the parse score", () => {
    const { markdown, report } = applyAtsHygiene(
      `${header}| Skill | Years |\n| --- | --- |\n| Payments | 9 |\n`,
    );
    expect(markdown).toContain("| Payments | 9 |");
    expect(report.findings.some((f) => f.code === "table")).toBe(true);
    expect(report.parseScore).toBeLessThan(100);
  });

  it("flags a heading no parser maps to a field", () => {
    const { report } = applyAtsHygiene(
      `${header}x\n\n## Things I Am Proud Of\n- One\n`,
    );
    expect(report.findings.some((f) => f.code === "header_nonstandard")).toBe(true);
  });

  it("accepts the standard headings the CVG skill prescribes", () => {
    const { report } = applyAtsHygiene(
      `${header}x\n\n## Experience\n- One\n\n## Core Competencies\n- Two\n\n## Education\n- Three\n`,
    );
    expect(report.findings.some((f) => f.code === "header_nonstandard")).toBe(false);
    expect(report.parseScore).toBe(100);
  });

  it("flags a CV with no contact line", () => {
    const { report } = applyAtsHygiene("# Bharath Raghu\n\n## Profile\nx\n");
    expect(report.findings.some((f) => f.code === "contact_missing")).toBe(true);
  });

  it("is idempotent — a repaired document reports nothing on a second pass", () => {
    const first = applyAtsHygiene(`${header}- Led  the​  rebuild.  \n`);
    const second = applyAtsHygiene(first.markdown);
    expect(second.markdown).toBe(first.markdown);
    expect(second.report.repairs).toEqual([]);
  });
});
