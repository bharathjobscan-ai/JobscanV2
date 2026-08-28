import { createHash } from "node:crypto";

/**
 * Job identity (JSV2S1039).
 *
 * Identity hierarchy, highest confidence first:
 *   1. source + source_job_id  — enforced by a unique index
 *   2. fingerprint             — this function, the fallback
 *
 * The fingerprint deliberately excludes the URL: the same posting often has
 * several URLs (tracking parameters, mirrored boards), and including it would
 * defeat the purpose.
 */
export function jobFingerprint(input: {
  company: string;
  title: string;
  location?: string | null;
}): string {
  const normalize = (value: string | null | undefined) =>
    (value ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const basis = [
    normalize(input.company),
    normalize(input.title),
    normalize(input.location),
  ].join("|");

  return createHash("sha256").update(basis).digest("hex");
}
