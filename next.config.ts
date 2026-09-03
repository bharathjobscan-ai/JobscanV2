import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Server Actions default to a 1 MB body, which the upload form silently hit
     * — `MAX_UPLOAD_BYTES` said 5 MB and never ran, because Next rejected the
     * request first. A single city's Apify export is already 1.2 MB.
     *
     * 4 MB, not more: Vercel caps a serverless request body at 4.5 MB and that
     * is a platform limit we cannot raise. Anything larger has to arrive by
     * fetching rather than uploading (JSV2S1017).
     */
    serverActions: { bodySizeLimit: "4mb" },
  },
  /**
   * Ship the files we read at runtime.
   *
   * `lib/ai/prompts.ts` and the upload-template route read from disk via
   * `process.cwd()`. Next.js traces static imports, not dynamic path reads, so
   * without this the serverless bundle omits both directories: generation fails
   * with MissingPromptError and the template download 404s — and only once
   * deployed, since locally the files are simply there.
   */
  outputFileTracingIncludes: {
    "/applications/**": ["./prompts/**/*.md"],
    "/api/**": ["./prompts/**/*.md", "./config/*.csv"],
  },
};

export default nextConfig;
