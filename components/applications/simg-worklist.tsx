"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Badge, Button, Card, CardHeader } from "@/components/ui/base";
import { LENS_LABELS, TARGET_DOCUMENT_SCORE } from "@/config/simg";
import {
  acceptAllAction,
  setRecommendationAction,
  type SimgActionState,
} from "@/features/simg/actions";
import type { SimgProjection } from "@/features/simg/apply";
import type { SimgEvaluation, SimgRecommendation } from "@/features/simg/types";

const EMPTY: SimgActionState = {};

const KIND_LABEL: Record<SimgRecommendation["kind"], string> = {
  modify: "Rewrite",
  insert: "Add",
  delete: "Remove",
};

function Submit({
  children,
  variant = "secondary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "…" : children}
    </Button>
  );
}

/**
 * The change itself, rendered the way a diff is (JSV2S1126).
 *
 * Struck red for what goes, green for what arrives. A `modify` shows both; an
 * `insert` has no red half and a `delete` no green one, which is exactly the
 * shape of the edit and needs no explaining.
 */
function Diff({ rec }: { rec: SimgRecommendation }) {
  return (
    <div className="mt-2 space-y-1 font-mono text-[11.5px] leading-relaxed">
      {rec.before ? (
        <p className="rounded bg-negative-bg px-2 py-1 text-negative">
          <span className="mr-1.5 select-none opacity-60">−</span>
          <s>{rec.before}</s>
        </p>
      ) : null}
      {rec.after ? (
        <p className="rounded bg-positive-bg px-2 py-1 text-positive">
          <span className="mr-1.5 select-none opacity-60">+</span>
          {rec.after}
        </p>
      ) : null}
      {rec.kind === "insert" && rec.anchorAfter ? (
        <p className="text-[11px] text-faint">
          Inserted after: <span className="italic">{rec.anchorAfter}</span>
        </p>
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
}: {
  applicationId: string;
  recommendationId: string;
  state: "accepted" | "discarded" | "pending";
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [result, action] = useActionState(setRecommendationAction, EMPTY);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="recommendationId" value={recommendationId} />
      <input type="hidden" name="state" value={state} />
      <Submit variant={variant}>{children}</Submit>
      {result.error ? (
        <span className="ml-2 text-[11px] text-negative">{result.error}</span>
      ) : null}
    </form>
  );
}

function Recommendation({
  rec,
  applicationId,
}: {
  rec: SimgRecommendation;
  applicationId: string;
}) {
  const done = rec.state !== "pending";

  return (
    <li className="border-t border-line py-3.5">
      <div className="flex items-start gap-3">
        <div className="w-24 shrink-0">
          <p className="text-[10.5px] font-medium tracking-wide uppercase">
            {LENS_LABELS[rec.lens]}
          </p>
          <p className="mt-1 text-[10.5px] tracking-wide text-faint uppercase">
            {KIND_LABEL[rec.kind]}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm">{rec.text}</p>
          {rec.detail ? <p className="mt-0.5 text-xs text-muted">{rec.detail}</p> : null}

          {/*
            The confirmation gate. Marked before the diff, not after, because the
            user reviews this list by eye before pressing Accept all — an
            unverified claim has to be impossible to skim past.
          */}
          {rec.requiresConfirmation ? (
            <p className="mt-2 rounded border border-warning/25 bg-warning-bg px-2 py-1.5 text-[11.5px] text-warning">
              <strong>Verify before accepting.</strong>{" "}
              {rec.confirm ?? "This asserts experience not evidenced in your master resume."}
            </p>
          ) : null}

          <Diff rec={rec} />
        </div>

        <div className="w-10 shrink-0 text-right text-base font-semibold tabular-nums">
          +{rec.points}
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-2">
        {done ? (
          <>
            <Badge tone={rec.state === "accepted" ? "positive" : "neutral"}>
              {rec.state === "accepted" ? "Applied" : "Discarded"}
            </Badge>
            <StateForm
              applicationId={applicationId}
              recommendationId={rec.id}
              state="pending"
              variant="ghost"
            >
              Undo
            </StateForm>
          </>
        ) : (
          <>
            <StateForm
              applicationId={applicationId}
              recommendationId={rec.id}
              state="accepted"
              variant="primary"
            >
              Accept
            </StateForm>
            <StateForm
              applicationId={applicationId}
              recommendationId={rec.id}
              state="discarded"
              variant="ghost"
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
 * SimG — the CV evaluation and its priced worklist (JSV2S1058 + JSV2S1126).
 *
 * Presentation only: every number here is computed server-side by
 * `features/simg/apply.ts`. That split is deliberate so this component can be
 * replaced by the approved design without touching the arithmetic.
 */
export function SimgWorklist({
  applicationId,
  evaluation,
  projection,
}: {
  applicationId: string;
  evaluation: SimgEvaluation;
  projection: SimgProjection;
}) {
  const { recommendations } = evaluation;
  const pending = recommendations.filter((r) => r.state === "pending");
  const actioned = recommendations.filter((r) => r.state !== "pending");
  const unverified = pending.filter((r) => r.requiresConfirmation).length;
  const reachedBar = projection.current >= TARGET_DOCUMENT_SCORE;

  return (
    <Card>
      <CardHeader
        title="CV evaluation"
        meta={`SimG · ${evaluation.provider ?? "—"}`}
      />

      <div className="px-5 pt-4">
        {/* baseline → generated → current, with the potential still on offer. */}
        <div className="flex flex-wrap items-baseline gap-2 text-2xl font-semibold tabular-nums">
          <span className="text-faint">{projection.baseline}</span>
          <span className="text-faint">→</span>
          <span className="text-muted">{projection.generated}</span>
          <span className="text-faint">→</span>
          <span className={reachedBar ? "text-positive" : ""}>{projection.current}</span>
          {projection.potential > projection.current ? (
            <span className="text-sm font-normal text-muted">
              of {projection.potential} available
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[11.5px] text-faint">
          Master resume → as generated → with your edits · document score, target{" "}
          {TARGET_DOCUMENT_SCORE}. This is not the job score.
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
          {(Object.keys(LENS_LABELS) as (keyof typeof LENS_LABELS)[]).map((key) => (
            <div key={key} className="bg-surface px-3 py-2.5">
              <dt className="text-[10px] tracking-wide text-faint uppercase">
                {LENS_LABELS[key]}
              </dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                {evaluation.current[key]?.score ?? "—"}
              </dd>
              {evaluation.current[key]?.note ? (
                <dd className="text-[11px] text-muted">{evaluation.current[key].note}</dd>
              ) : null}
            </div>
          ))}
        </dl>

        {projection.overflows ? (
          <p className="mt-3 rounded border border-negative/25 bg-negative-bg px-2 py-1.5 text-[11.5px] text-negative">
            The CV now runs about {projection.overBy} lines onto a second page.
            Accept a removal or discard an addition.
          </p>
        ) : null}
      </div>

      {recommendations.length > 0 ? (
        <div className="px-5 pb-4">
          {/*
            Only what still needs a decision stays on screen. An accepted or
            discarded item has been dealt with and is just noise from then on,
            so it rolls into the history disclosure below where it can still be
            reopened.
          */}
          <ul className="mt-3">
            {pending.map((rec) => (
              <Recommendation key={rec.id} rec={rec} applicationId={applicationId} />
            ))}
          </ul>

          {pending.length === 0 ? (
            <p className="border-t border-line py-4 text-xs text-muted">
              Every recommendation has been actioned. Regenerate the CV for a
              fresh evaluation.
            </p>
          ) : null}

          {actioned.length > 0 ? (
            <details className="border-t border-line pt-3">
              <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">
                Action history
                <span className="ml-1.5 text-subtle">
                  ({projection.acceptedCount} applied ·{" "}
                  {projection.discardedCount} discarded)
                </span>
              </summary>
              <ul className="mt-1">
                {actioned.map((rec) => (
                  <Recommendation key={rec.id} rec={rec} applicationId={applicationId} />
                ))}
              </ul>
            </details>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
            <p className="text-[11.5px] text-muted">
              {projection.acceptedCount} applied · {projection.pendingCount} pending ·{" "}
              {projection.discardedCount} discarded
            </p>
            <AcceptAll
              applicationId={applicationId}
              pendingCount={pending.length}
              unverified={unverified}
            />
          </div>
        </div>
      ) : (
        <p className="px-5 pb-4 text-xs text-muted">
          No applicable recommendations.
          {evaluation.rejected?.length
            ? ` ${evaluation.rejected.length} were discarded as unapplicable.`
            : ""}
        </p>
      )}
    </Card>
  );
}
