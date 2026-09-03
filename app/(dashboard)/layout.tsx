import Link from "next/link";
import type { ReactNode } from "react";

import { countAwaitingReview } from "@/features/prequalification/queries";
import { getEnv } from "@/lib/config/env";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const env = getEnv();
  // Jobs held back by the gate are invisible on every other page, so the count
  // lives in the nav — an unwatched review queue is the same as no gate.
  const awaiting = await countAwaitingReview().catch(() => 0);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-5 px-5">
          <Link href="/applications" className="text-sm font-semibold tracking-tight">
            JobScan
          </Link>
          <nav className="flex items-center gap-4 text-xs">
            <Link href="/applications" className="text-muted hover:text-foreground">
              Applications
            </Link>
            <Link href="/pipeline" className="text-muted hover:text-foreground">
              Pipeline
            </Link>
            <Link href="/review" className="text-muted hover:text-foreground">
              Review{awaiting > 0 ? ` (${awaiting})` : ""}
            </Link>
            <Link href="/upload" className="text-muted hover:text-foreground">
              Upload
            </Link>
          </nav>
          <span
            className="ml-auto text-[11px] text-subtle"
            title={
              env.AI_PROVIDER === "mock"
                ? "Fixture mode — nothing is generated and nothing is charged"
                : `Scoring: ${env.PROVIDER_SCORING === "gemini_api" ? env.MODEL_SCORING_GEMINI : env.MODEL_SCORING} · ` +
                  `CV/CL: ${env.PROVIDER_CV === "gemini_api" ? env.MODEL_CV_GEMINI : env.MODEL_CV}`
            }
          >
            AI:{" "}
            {env.AI_PROVIDER === "mock"
              ? "mock"
              : `${env.PROVIDER_SCORING === "gemini_api" ? "Gemini" : "Claude"} score · ${
                  env.PROVIDER_CV === "gemini_api" ? "Gemini" : "Claude"
                } docs`}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6">{children}</main>
    </div>
  );
}

// Live personal data — always rendered per request, never prerendered at build.
export const dynamic = "force-dynamic";
