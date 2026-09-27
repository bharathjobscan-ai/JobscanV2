"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Badge, Button } from "@/components/ui/base";
import { Panel, PanelGrid, SectionHead } from "@/components/applications/detail/section";
import { SimgScorePanel } from "@/components/applications/detail/simg/score-panel";
import { LENS_LABELS, TARGET_DOCUMENT_SCORE } from "@/config/simg";
import {
  acceptAllAction,
  setRecommendationAction,
  type SimgActionState,
} from "@/features/simg/actions";
import type { SimgProjection } from "@/features/simg/apply";
import type { SimgEvaluation, SimgRecommendation } from "@/features/simg/types";
import type { AtsMeasurement } from "@/features/simg/measure";

const EMPTY: SimgActionState = {};

const KIND_LABEL: Record<SimgRecommendation["kind"], string> = {
  modify: "Rewrite",
  insert: "Add",
  delete: "Remove",
};

/**
 * "Recruiter · 6 sec" → name and marker, split rather than restated.
 *
 * The qualifier the design shows as a clock marker is already in the config
 * label; duplicating it here as a literal would be a second place to edit and
 * a second place to be wrong.
 */
function lensParts(label: string): { name: string; marker: string | null } {
  const [name, ...rest] = label.split("·").map((part) => part.trim());
  const marker = rest.join(" · ");
  return { name, marker: marker.length > 0 ? marker : null };
}

function Submit({
  children,
  variant = "secondary",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending ? "…" : children}
    </Button>
  );
}

/**
 * The change itself, rendered the way a diff is (JSV2S1126).
 *
 * Struck red for what goes, green for what arrives, each under its own label
 * so the two halves cannot be confused at a glance. A `modify` shows both; an
 * `insert` has no red half and a `delete` no green one, which is exactly the
 * shape of the edit and needs no explaining.
 */
function Diff({ rec }: { rec: SimgRecommendation }) {
  return (
    <div className="grid gap-3 text-[12px] leading-relaxed sm:grid-cols-2">
      {rec.before ? (
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.12em] text-faint uppercase">
            Current resume text
          </p>
          <p className="n-mono mt-1.5 rounded bg-negative-bg px-3 py-2.5 text-negative line-through">
            {rec.before}
          </p>
        </div>
      ) : null}
      {rec.after ? (
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.12em] text-faint uppercase">
            {rec.kind === "insert" ? "Proposed addition" : "Proposed replacement"}
          </p>
          <p className="n-mono mt-1.5 rounded bg-positive-bg px-3 py-2.5 text-positive">
            {rec.after}
          </p>
          {rec.kind === "insert" && rec.anchorAfter ? (
            <p className="mt-1.5 text-[11.5px] text-faint italic">
              Inserted after: {rec.anchorAfter}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StateForm({
  applicationId,
  recommendationId,
  state,
  children,
  variant,
  block = false,
}: {
  applicationId: string;
  recommendationId: string;
  state: "accepted" | "discarded" | "pending";
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  /** Stretch the control to the column width, as the design stacks them. */
  block?: boolean;
}) {
  const [result, action] = useActionState(setRecommendationAction, EMPTY);
  return (
    <form action={action} className={block ? "block" : "inline"}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="recommendationId" value={recommendationId} />
      <input type="hidden" name="state" value={state} />
      <Submit variant={variant} className={block ? "w-full" : ""}>
        {children}
      </Submit>
      {result.error ? (
        <span className="ml-2 text-[11px] text-negative">{result.error}</span>
      ) : null}
    </form>
  );
}

/**
 * One recommendation, in the design's three columns: which lens is speaking
 * and what it is worth, the change itself, and the decision.
 */
function Recommendation({
  rec,
  applicationId,
}: {
  rec: SimgRecommendation;
  applicationId: string;
}) {
  const done = rec.state !== "pending";
  const { name, marker } = lensParts(LENS_LABELS[rec.lens]);

  return (
    <li
      className="grid grid-cols-1 gap-x-6 gap-y-4 border-t py-6 sm:grid-cols-[minmax(150px,168px)_minmax(0,1fr)] lg:grid-cols-[minmax(150px,168px)_minmax(0,1fr)_128px]"
      style={{ borderColor: "var(--hair)" }}
    >
      <div className="min-w-0">
        <p className="text-[10px] tracking-[0.12em] text-faint uppercase">{name}</p>

        <div className="mt-1.5 flex items-baseline gap-2.5">
          <span className="n-display text-[19px] font-semibold text-positive tabular-nums">
            +{rec.points}
          </span>
          {marker ? (
            <span className="text-[11px] text-faint tabular-nums">
              <span aria-hidden>◷ </span>
              {marker}
            </span>
          ) : null}
        </div>

        <p className="n-display mt-2.5 text-[15px] font-semibold">{rec.text}</p>
        {rec.detail ? (
          <p className="mt-1.5 text-[12px] text-faint">{rec.detail}</p>
        ) : null}

        <span className="mt-2.5 inline-block rounded-sm border border-line-strong px-2 py-0.5 text-[10px] tracking-[0.1em] text-muted uppercase">
          {KIND_LABEL[rec.kind]}
        </span>
      </div>

      <div className="min-w-0">
        {/*
          The confirmation gate. Marked before the diff, not after, because the
          user reviews this list by eye before pressing Accept all — an
          unverified claim has to be impossible to skim past.
        */}
        {rec.requiresConfirmation ? (
          <p
            className="mb-3 rounded px-3 py-2.5 text-[12.5px]"
            style={{
              border: "1px solid color-mix(in srgb, var(--gold) 45%, transparent)",
              background: "color-mix(in srgb, var(--gold) 9%, transparent)",
            }}
          >
            <span style={{ color: "var(--gold)" }}>Verify before accepting.</span>{" "}
            {rec.confirm ?? "This asserts experience not evidenced in your master resume."}
          </p>
        ) : null}

        <Diff rec={rec} />
      </div>

      <div className="flex flex-wrap items-start gap-2 lg:flex-col lg:gap-2">
        {done ? (
          <>
            <Badge tone={rec.state === "accepted" ? "positive" : "neutral"}>
              {rec.state === "accepted" ? "Applied" : "Discarded"}
            </Badge>
            <StateForm
              applicationId={applicationId}
              recommendationId={rec.id}
              state="pending"
              variant="secondary"
              block
            >
              <span aria-hidden>↺</span> Undo
            </StateForm>
          </>
        ) : (
          <>
            <StateForm
              applicationId={applicationId}
              recommendationId={rec.id}
              state="accepted"
              variant="primary"
              block
            >
              <span aria-hidden>✓</span> Accept
            </StateForm>
            <StateForm
              applicationId={applicationId}
              recommendationId={rec.id}
              state="discarded"
              variant="secondary"
              block
            >
              Discard
            </StateForm>
          </>
        )}
      </div>
    </li>
  );
}

function AcceptAll({
  applicationId,
  pendingCount,
  unverified,
}: {
  applicationId: string;
  pendingCount: number;
  unverified: number;
}) {
  const [result, action] = useActionState(acceptAllAction, EMPTY);
  if (pendingCount === 0) return null;

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <Submit variant="primary">Accept all {pendingCount}</Submit>
      {unverified > 0 ? (
        <span className="text-[11.5px] text-warning">
          {unverified} of these need verifying first
        </span>
      ) : null}
      {result.error ? (
        <span className="text-[11.5px] text-negative">{result.error}</span>
      ) : null}
      {result.message ? (
        <span className="text-[11.5px] text-positive">{result.message}</span>
      ) : null}
    </form>
  );
}

/**
 * SimG — the CV evaluation and its priced worklist (JSV2S1058 + JSV2S1126),
 * drawn to the Nocturnal design (JSV2S1172).
 *
 * Presentation only: every number here is computed server-side by
 * `features/simg/apply.ts`. That split is deliberate so this component can be
 * restyled without touching the arithmetic — in particular `overflows`, which
 * is re-derived from the replayed CV on every accept and is never taken from
 * the model.
 */
export function SimgWorklist({
  applicationId,
  evaluation,
  projection,
  measured,
}: {
  applicationId: string;
  evaluation: SimgEvaluation;
  projection: SimgProjection;
  /** JSV2S1145 — the ATS lens recomputed on the current CV, or null. */
  measured?: AtsMeasurement | null;
}) {
  const { recommendations } = evaluation;
  const pending = recommendations.filter((r) => r.state === "pending");
  const actioned = recommendations.filter((r) => r.state !== "pending");
  const unverified = pending.filter((r) => r.requiresConfirmation).length;
  const reachedBar = projection.current >= TARGET_DOCUMENT_SCORE;

  return (
    <section>
      <SectionHead
        title="SimG · three lenses on the resume"
        meta={`${evaluation.provider ?? "—"} · ${projection.pendingCount} pending · ${projection.acceptedCount} applied`}
      />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
        <p className="max-w-[64ch] flex-1 text-[13.5px] text-muted">
          SimG reads the resume as an ATS parser, a recruiter with six seconds,
          and the hiring manager. Every edit shows the line it replaces. Accept and
          the score moves; discard and nothing changes.
        </p>
        <SimgScorePanel projection={projection} />
      </div>

      <PanelGrid min="170px" className="mt-5">
        {(Object.keys(LENS_LABELS) as (keyof typeof LENS_LABELS)[]).map((key) => (
          <Panel key={key} label={LENS_LABELS[key]} className="p-4">
            <p className="n-display mt-1.5 text-[21px] font-semibold tabular-nums">
              {evaluation.current[key]?.score ?? "—"}
            </p>
            {evaluation.current[key]?.note ? (
              <p className="mt-0.5 text-[11.5px] text-muted">
                {evaluation.current[key].note}
              </p>
            ) : null}
          </Panel>
        ))}
      </PanelGrid>

      {/*
        JSV2S1145 — stated as MEASURED, beside an otherwise estimated score.
        Parse readiness and keyword coverage are both deterministic, so this
        third of the composite is fact; the recruiter and hiring-manager
        lenses remain the model's judgement and are labelled as such.
      */}
      {measured ? (
        <div className="mt-3 rounded-md border border-line bg-surface-muted px-4 py-3">
          <p className="text-[10px] tracking-[0.12em] text-faint uppercase">
            ATS lens, measured on the current CV
          </p>
          <p className="mt-1.5 text-[14px]">
            <span className="n-display text-[19px] font-semibold tabular-nums">
              {measured.lensScore}
            </span>
            {measured.delta !== null && measured.delta !== 0 ? (
              <span
                className={
                  measured.delta > 0 ? "ml-2 text-positive" : "ml-2 text-negative"
                }
              >
                {measured.delta > 0 ? "+" : ""}
                {measured.delta} vs SimG&rsquo;s estimate
              </span>
            ) : (
              <span className="ml-2 text-muted">matches SimG&rsquo;s estimate</span>
            )}
          </p>
          <p className="mt-1 text-[11.5px] text-subtle tabular-nums">
            Parse {measured.parseScore} · keywords {measured.mustHaveFound}/
            {measured.mustHaveTotal}
            {measured.recovered.length > 0
              ? ` · recovered ${measured.recovered.join(", ")}`
              : ""}
          </p>
          {measured.stillMissing.length > 0 ? (
            <p className="mt-1 text-[11.5px] text-warning">
              Still missing: {measured.stillMissing.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
        Re-derived on every accept from the replayed CV, never from the model.
        One page is the contract with the .docx renderer, so this has to be the
        loudest thing on the screen when it is true.
      */}
      {projection.overflows ? (
        <p className="mt-3 rounded border border-negative/25 bg-negative-bg px-3 py-2 text-[12px] text-negative">
          The CV now runs about {projection.overBy} lines onto a second page.
          Accept a removal or discard an addition.
        </p>
      ) : null}

      {recommendations.length > 0 ? (
        <div className="mt-6">
          {/*
            Only what still needs a decision stays on screen. An accepted or
            discarded item has been dealt with and is just noise from then on,
            so it rolls into the history disclosure below where it can still be
            reopened.
          */}
          <ul>
            {pending.map((rec) => (
              <Recommendation key={rec.id} rec={rec} applicationId={applicationId} />
            ))}
          </ul>

          {pending.length === 0 ? (
            <p
              className="border-t py-5 text-[13.5px] text-muted"
              style={{ borderColor: "var(--hair)" }}
            >
              Every recommendation has been actioned. Regenerate the CV for a
              fresh evaluation.
            </p>
          ) : null}

          {actioned.length > 0 ? (
            <details className="border-t pt-4" style={{ borderColor: "var(--hair)" }}>
              <summary className="cursor-pointer text-[13px] text-muted hover:text-foreground">
                Action history
                <span className="ml-1.5 text-subtle">
                  ({projection.acceptedCount} applied · {projection.discardedCount}{" "}
                  discarded)
                </span>
              </summary>
              <ul className="mt-1">
                {actioned.map((rec) => (
                  <Recommendation key={rec.id} rec={rec} applicationId={applicationId} />
                ))}
              </ul>
            </details>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-foreground/40 pt-4">
            <div>
              <p className="text-[13px] text-muted">Projected document score</p>
              <p className="text-[11.5px] text-faint tabular-nums">
                {projection.acceptedCount} applied · {projection.pendingCount} pending ·{" "}
                {projection.discardedCount} discarded
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <AcceptAll
                applicationId={applicationId}
                pendingCount={pending.length}
                unverified={unverified}
              />
              <span
                className={`n-display text-[24px] font-semibold tabular-nums ${
                  reachedBar ? "text-positive" : ""
                }`}
              >
                {projection.potential}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-5 text-[13.5px] text-muted">
          No applicable recommendations.
          {evaluation.rejected?.length
            ? ` ${evaluation.rejected.length} were discarded as unapplicable.`
            : ""}
        </p>
      )}
    </section>
  );
}
