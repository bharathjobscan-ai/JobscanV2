import type { ReactNode } from "react";

import { GenerationSummary } from "@/components/applications/generation-summary";
import { IconTile } from "@/components/applications/detail/material/icon-tile";
import { Panel, PanelGrid, SectionHead } from "@/components/applications/detail/section";
import { buttonClass } from "@/components/ui/base";
import { LENS_LABELS, TARGET_DOCUMENT_SCORE, type LensKey } from "@/config/simg";
import type { GenerationSummary as Summary } from "@/lib/ai/types";

/**
 * The Material tab of the application workspace, drawn to the Nocturnal design
 * (JSV2S1172).
 *
 * Three cards and a quick-actions strip, in that order, because that is the
 * order the questions are asked: is there a resume, is there a letter, is it
 * any good, and what can I do about it.
 *
 * NOTHING IS INVENTED HERE. No application in this database has a generated
 * document, so the state this actually renders is the empty one — the cards
 * stay, each saying plainly that it has nothing yet and what would produce it,
 * rather than being replaced by a single apologetic line. The alternative,
 * showing the design's populated sample, would be a screen that lies.
 */

export type MaterialDocumentRef = {
  id: string;
  version: number;
} | null;

export type MaterialScore = {
  /** Composite with the accepted SimG edits — `SimgProjection.current`. */
  current: number;
  /** Composite of the master resume, before tailoring. */
  baseline: number;
  acceptedCount: number;
  /** The three lens scores as SimG reported them, for the sub-line. */
  lenses: Partial<Record<LensKey, number>>;
} | null;

/** "ATS parse · 88", from the config label — never a hardcoded lens name. */
function lensSubline(lenses: Partial<Record<LensKey, number>>): string | null {
  const parts = (Object.keys(LENS_LABELS) as LensKey[])
    .map((key) => {
      const score = lenses[key];
      if (score === undefined) return null;
      // The config labels carry a qualifier after a middot ("Recruiter · 6 sec")
      // which is too long for a card sub-line; the name alone identifies it.
      const name = LENS_LABELS[key].split("·")[0].trim();
      return `${name} ${score}`;
    })
    .filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** A card that has nothing to show, saying so rather than being hidden. */
function Waiting({ children }: { children: ReactNode }) {
  return (
    <>
      <p className="n-display mt-2.5 text-[19px] font-semibold text-faint">Not yet</p>
      <p className="mt-1 text-[11.5px] text-faint">{children}</p>
    </>
  );
}

function CardHead({ glyph, label }: { glyph: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <IconTile glyph={glyph} />
      <span className="text-[10px] tracking-[0.13em] text-faint uppercase">{label}</span>
    </div>
  );
}

export function MaterialTab({
  resume,
  coverLetter,
  summary,
  fit,
  score,
  actions,
  blockedReason,
}: {
  resume: MaterialDocumentRef;
  coverLetter: MaterialDocumentRef;
  /** The CVG summary stored on the resume version, when there is one. */
  summary?: Summary | null;
  /** `pageFit` over the CV as it currently stands, or null when there is none. */
  fit?: { fits: boolean; overBy: number } | null;
  score: MaterialScore;
  /** The page's generate / regenerate buttons — the only real write actions here. */
  actions?: ReactNode;
  /** Why generation is unavailable, when it is. */
  blockedReason?: string;
}) {
  const sub = score ? lensSubline(score.lenses) : null;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <SectionHead title="Material" />
        <span className="text-[11.5px] text-faint">
          Generated automatically on qualification
        </span>
      </div>

      <p className="mt-2.5 max-w-[62ch] text-[13.5px] text-muted">
        Your tailored application documents, generated and optimised for this role.
      </p>

      <PanelGrid min="210px" className="mt-5">
        <Panel>
          <CardHead glyph="▤" label="Tailored resume" />
          {resume ? (
            <>
              <p className="n-display mt-2.5 text-[19px] font-semibold">
                v{resume.version} ready
              </p>
              <p className="mt-1 text-[11.5px] text-faint">
                .docx · one page · ATS safe
                {fit && !fit.fits ? ` · over by ~${fit.overBy} lines` : ""}
              </p>
              <a
                href={`/api/documents/${resume.id}`}
                className={`${buttonClass.secondary} mt-3.5`}
              >
                <span aria-hidden>⤓</span> Download
              </a>
            </>
          ) : (
            <Waiting>
              One pass writes the CV and its cover letter together. Nothing has been
              generated for this application.
            </Waiting>
          )}
        </Panel>

        <Panel>
          <CardHead glyph="✉" label="Cover letter" />
          {coverLetter ? (
            <>
              <p className="n-display mt-2.5 text-[19px] font-semibold">
                v{coverLetter.version} ready
              </p>
              <p className="mt-1 text-[11.5px] text-faint">
                .docx · addressed to the team
              </p>
              <a
                href={`/api/documents/${coverLetter.id}`}
                className={`${buttonClass.secondary} mt-3.5`}
              >
                <span aria-hidden>⤓</span> Download
              </a>
            </>
          ) : (
            <Waiting>
              Written in the same pass as the resume, so it arrives with it or not at
              all.
            </Waiting>
          )}
        </Panel>

        <Panel>
          <CardHead glyph="◎" label="Document score" />
          {score ? (
            <>
              <p className="n-display mt-2.5 text-[19px] font-semibold tabular-nums">
                {score.current}
                <span className="ml-1.5 text-[12px] font-normal text-faint">
                  of {TARGET_DOCUMENT_SCORE} target
                </span>
              </p>
              {sub ? (
                <p className="mt-1 text-[11.5px] text-faint tabular-nums">{sub}</p>
              ) : null}
              <p className="mt-1 text-[11.5px] text-faint tabular-nums">
                {score.baseline} before tailoring · {score.acceptedCount} edit
                {score.acceptedCount === 1 ? "" : "s"} applied
              </p>
            </>
          ) : (
            <Waiting>
              SimG scores the resume through three lenses once one exists. Target{" "}
              {TARGET_DOCUMENT_SCORE}. This is not the job score.
            </Waiting>
          )}
        </Panel>
      </PanelGrid>

      {/*
        The design's "Quick actions" strip. Its sample buttons — preview and
        share — are features this app does not have, so the strip carries the
        actions that exist: generation, and the two downloads. A button that
        does nothing would be worse than an honest gap.
      */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <IconTile glyph="⚡" tone="slate" />
          <div className="min-w-0">
            <p className="text-[14px]">Quick actions</p>
            <p className="mt-0.5 text-[11.5px] text-faint">
              {resume || coverLetter
                ? "Common next steps for your application material."
                : blockedReason
                  ? `${blockedReason} — then one pass writes both documents.`
                  : "One pass writes the tailored CV and its cover letter together."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {resume ? (
            <a href={`/api/documents/${resume.id}`} className={buttonClass.secondary}>
              <span aria-hidden>⤓</span> Resume
            </a>
          ) : null}
          {coverLetter ? (
            <a
              href={`/api/documents/${coverLetter.id}`}
              className={buttonClass.secondary}
            >
              <span aria-hidden>⤓</span> Cover letter
            </a>
          ) : null}
          {actions}
        </div>
      </div>

      {resume ? (
        <div className="mt-7">
          {summary ? (
            <GenerationSummary summary={summary} />
          ) : (
            <p className="text-[13.5px] text-muted">
              No summary captured — regenerate to see the classification and gaps.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
