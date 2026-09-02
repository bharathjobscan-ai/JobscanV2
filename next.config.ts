import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
