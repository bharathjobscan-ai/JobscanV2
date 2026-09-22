import Link from "next/link";
import type { ReactNode } from "react";

import { countAwaitingReview } from "@/features/prequalification/queries";
import { getSpendSummary } from "@/features/ai/spend";
import { formatUsd } from "@/lib/ai/pricing";

/**
 * The app's routes, in the order the design lists them.
 *
 * Held as data rather than eight hand-written links: the header is now
 * transcribed from a design file and a list is far easier to keep faithful to
 * it than a wall of near-identical JSX.
 */
const NAV = [
  { href: "/applications", label: "Applications" },
  { href: "/review", label: "Review" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/spend", label: "Cost" },
  { href: "/rules", label: "Rules" },
  { href: "/upload", label: "Upload" },
] as const;
import { getEnv } from "@/lib/config/env";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const env = getEnv();
  // Jobs held back by the gate are invisible on every other page, so the count
  // lives in the nav — an unwatched review queue is the same as no gate.
  /*
   * The design's header carries the month's spend, so the layout needs it.
   * Both are best-effort: a header that throws takes every page with it, and
   * neither number is worth that.
   */
  const monthStart = new Date();
  monthStart.setDate(1);
  const [awaiting, spend] = await Promise.all([
    countAwaitingReview().catch(() => 0),
    getSpendSummary(monthStart.toISOString().slice(0, 10), null).catch(() => null),
  ]);
  const monthSpend = spend?.totalUsd ?? 0;

  return (
    /* `overflow-x-clip` is what makes `.n-bleed` safe: a full-bleed child is
       100vw wide, which exceeds 100% by the scrollbar's width. Clip rather than
       hidden — hidden would create a scroll container and break `position:
       sticky` on the header above. */
    <div className="flex min-h-full flex-1 flex-col overflow-x-clip">
      {/*
        Chrome transcribed from the design project's own header: 1248px column,
        56px gutters, 62px tall, translucent over a blur. The nav is the app's
        routes rather than the design's placeholder list.
      */}
      <header
        className="sticky top-0 z-40 border-b border-line backdrop-blur-[14px]"
        style={{ background: "rgba(9, 11, 12, 0.72)" }}
      >
        <div className="mx-auto flex min-h-[62px] max-w-[1248px] items-center gap-7 px-6 xl:px-14">
          <Link
            href="/applications"
            className="n-display flex-none text-[26px] leading-none font-semibold tracking-[-0.005em]"
          >
            JobScan
          </Link>

          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-[13px]">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                {item.label}
                {item.href === "/review" && awaiting > 0 ? ` (${awaiting})` : ""}
              </Link>
            ))}
          </nav>

          <span
            className="n-mono flex-none text-[11.5px] whitespace-nowrap text-faint"
            title={
              env.AI_PROVIDER === "mock"
                ? "Fixture mode — nothing is generated and nothing is charged"
                : `Scoring: ${env.PROVIDER_SCORING === "gemini_api" ? env.MODEL_SCORING_GEMINI : env.MODEL_SCORING} · ` +
                  `CV/CL: ${env.PROVIDER_CV === "gemini_api" ? env.MODEL_CV_GEMINI : env.MODEL_CV}`
            }
          >
            {env.AI_PROVIDER === "mock" ? "fixtures · no spend" : `${formatUsd(monthSpend)} this month`}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1248px] flex-1 px-6 py-8 xl:px-14">
        {children}
      </main>
    </div>
  );
}

// Live personal data — always rendered per request, never prerendered at build.
export const dynamic = "force-dynamic";
