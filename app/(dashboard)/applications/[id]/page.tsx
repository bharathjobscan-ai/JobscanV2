import Link from "next/link";
import { notFound } from "next/navigation";

import {
  MatchBadge,
  ReferralBadge,
  StatusBadge,
} from "@/components/applications/badges";
import {
  AttemptForm,
  DescriptionForm,
  GenerateButton,
  NoteForm,
  ReferralForm,
  StatusForm,
} from "@/components/applications/workspace-forms";
import { AiCostCard } from "@/components/applications/ai-cost";
import { GenerationSummary } from "@/components/applications/generation-summary";
import { ScoreBreakdown } from "@/components/applications/score-breakdown";
import { SimgWorklist } from "@/components/applications/simg-worklist";
import { RawJdDialog } from "@/components/applications/raw-jd-dialog";
import {
  ArtworkBackdrop,
  ArtworkCredit,
} from "@/components/applications/artwork-backdrop";
import { ScoreLedgerTable } from "@/components/applications/score-ledger";
import {
  Basis,
  FigureRow,
  OnNeed,
  ScoreHero,
  type Figure,
} from "@/components/applications/score-hero";
import { Badge, buttonClass, Card, CardHeader, EmptyState } from "@/components/ui/base";
import { Markdown } from "@/components/ui/markdown";
import { getApplicationCost } from "@/features/ai/queries";
import { getGroundingUsage } from "@/features/ai/budget-queries";
import { getTaskStates, settleAiJobs } from "@/features/ai/tasks";
import { getApplicationDetail } from "@/features/applications/queries";
import {
  DOCUMENT_LABELS,
  REFERRAL_LABELS,
  STATUS_LABELS,
} from "@/lib/config/constants";
import { pageFit } from "@/lib/documents/parse";
import { applyAccepted, project } from "@/features/simg/apply";
import { measureAts } from "@/features/simg/measure";
import { resolveArtwork } from "@/features/artwork/resolve";
import { buildLedger } from "@/features/scoring/ledger";
import { GateVerdictPanel } from "@/components/applications/gate-verdict";
import { VISA_REASON_LABELS } from "@/features/prequalification/labels";
import type { ComponentProps } from "react";

type GateDetail = NonNullable<ComponentProps<typeof GateVerdictPanel>["detail"]>;

/**
 * The application workspace, rebuilt to the approved design (JSV2S1139).
 *
 * The page answers one question — apply or not — so the score is the single
 * result at the centre and everything else sits underneath it in the order the
 * decision is actually made: the number, the figures behind it, the arithmetic
 * on request, why it reads that way, what has been produced, and what SimG
 * would change.
 *
 * Low-frequency detail — the full analysis, the job facts, attempts, versions,
 * the timeline — moved behind "on need" disclosures rather than competing for
 * attention in a sidebar. NOTHING WAS REMOVED; it is one click further away.
 */

function formatDate(value: Date | string | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Generation settles inline, so this is only a safety net for a run that
  // died between recording and settling. Issued alongside the reads rather
  // than before them: a sequential wave costs a full round trip.
  const [, application, tasks, cost, grounding] = await Promise.all([
    settleAiJobs(id),
    getApplicationDetail(id),
    getTaskStates(id),
    getApplicationCost(id),
    getGroundingUsage(),
  ]);

  if (!application) notFound();

  const { job } = application;
  const resume = application.latestDocuments.resume;
  const coverLetter = application.latestDocuments.cover_letter;
  const scoreReport = application.latestDocuments.score_report;

  const artwork = resolveArtwork({ location: job.location, country: job.country });
  const ledger = buildLedger(application.jobScoreAnalysis, application.jobScore);

  /**
   * The stored verdict, read once and passed down (JSV2S1165).
   *
   * Cast rather than parsed: it is our own jsonb, written by our own engine,
   * and every field is read optionally so a verdict recorded before a filter
   * existed renders as an absence rather than a crash.
   */
  const gate = job.prequalificationDetail as GateDetail | null;
  const matchedDomainTerms = gate?.domain?.matchedTerms ?? [];

  const evaluation = resume?.simg ?? null;
  const derivedCv =
    evaluation && resume?.contentMd
      ? applyAccepted(resume.contentMd, evaluation.recommendations)
      : null;
  const simgProjection = evaluation && derivedCv ? project(evaluation, derivedCv) : null;
  const atsMeasured = evaluation && derivedCv ? measureAts(derivedCv, evaluation) : null;

  const blockedReason = application.isIncomplete
    ? "Add the job description first"
    : undefined;
  const taskFor = (type: string) => tasks.find((t) => t.taskType === type);

  const analysis = application.jobScoreAnalysis;

  /** The four figures: the facts the score rests on, at a glance. */
  const figures: Figure[] = [
    {
      label: "Visa signal",
      value: application.visaSignal ?? "Not established",
      hint: analysis?.visaSignals?.length
        ? `${analysis.visaSignals.length} signal${analysis.visaSignals.length === 1 ? "" : "s"}`
        : undefined,
      tone: application.visaSignal ? undefined : "negative",
    },
    {
      label: "Document score",
      value: simgProjection
        ? `${simgProjection.baseline} → ${simgProjection.current}`
        : "—",
      hint: simgProjection
        ? `${simgProjection.acceptedCount} edit${simgProjection.acceptedCount === 1 ? "" : "s"} applied`
        : "No CV generated",
    },
    {
      label: "Referral",
      value: REFERRAL_LABELS[application.referralStatus],
      hint: application.referrerName ?? undefined,
      tone: application.referralStatus === "needed" ? "warning" : undefined,
    },
    {
      label: "Next action",
      value: application.nextAction,
      hint: resume ? `Resume v${resume.version} ready` : "Nothing generated",
    },
  ];

  const fit = derivedCv ? pageFit(derivedCv) : null;

  return (
    <div className="relative">
      <ArtworkBackdrop artwork={artwork} />

      {/* Standing bar: status stays in reach whatever is on screen. */}
      <div className="sticky top-0 z-20 -mx-4 mb-2 border-b border-line bg-background/85 px-4 py-2.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/applications"
            className="shrink-0 text-xs text-muted hover:text-foreground"
          >
            ← Applications
          </Link>
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{job.title}</span>
            <span className="truncate text-xs text-faint">{job.company}</span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <MatchBadge category={application.matchCategory} />
            <ReferralBadge status={application.referralStatus} />
            <StatusBadge status={application.status} isPending={application.isPending} />
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-4xl">
        {tasks.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-line bg-surface-muted px-4 py-2.5 text-xs">
            {tasks.map((task) => (
              <span key={task.id} className="flex items-center gap-1.5">
                <Badge tone={task.status === "failed" ? "negative" : "info"}>
                  {task.label}: {task.status}
                </Badge>
                {task.error ? <span className="text-negative">{task.error}</span> : null}
              </span>
            ))}
          </div>
        ) : null}

        {application.isIncomplete ? (
          <Card className="mb-4">
            <CardHeader
              title="Job description missing"
              meta="required for scoring and tailoring"
            />
            <DescriptionForm
              applicationId={application.id}
              rawJobId={job.id}
              current={job.description}
            />
          </Card>
        ) : null}

        {/* --- The result ------------------------------------------------- */}
        <ScoreHero
          score={application.jobScore}
          matchCategory={application.matchCategory}
          summary={analysis?.summary}
          company={job.company}
          location={job.location}
          title={job.title}
        />

        <div className="mb-8 flex flex-wrap justify-center gap-2">
          <GenerateButton
            applicationId={application.id}
            taskType="score"
            label="Generate score"
            disabled={application.isIncomplete || !!taskFor("score")}
            disabledReason={blockedReason}
            regenerate={application.jobScore !== null}
          />
          <GenerateButton
            applicationId={application.id}
            taskType="tailor_cv"
            label="Generate CV + CL"
            disabled={application.isIncomplete || !!taskFor("tailor_cv")}
            disabledReason={blockedReason}
            regenerate={!!resume}
          />
        </div>

        <FigureRow figures={figures} />

        {/* The arithmetic, on request. Collapsed because it is reference
            rather than headline — but one click away, because a score you
            cannot audit is a score you cannot argue with. */}
        {ledger ? (
          <details className="mt-6 rounded-lg border border-line bg-surface p-5">
            <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">
              Show the calculation
            </summary>
            <div className="mt-4">
              <ScoreLedgerTable ledger={ledger} />
            </div>
          </details>
        ) : null}

        <Basis holding={analysis?.strengths ?? []} failing={analysis?.gaps ?? []} />

        {/* --- Material --------------------------------------------------- */}
        <section className="pt-12">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <p className="text-[11px] tracking-wider text-faint uppercase">Material</p>
            <p className="text-[11px] text-faint">Generated on qualification</p>
          </div>

          {!resume && !coverLetter ? (
            <Card>
              <EmptyState
                title="No documents yet"
                hint="One pass writes the tailored CV and its cover letter together."
              />
            </Card>
          ) : (
            <Card>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                {resume ? (
                  <a href={`/api/documents/${resume.id}`} className={buttonClass.primary}>
                    Download CV
                  </a>
                ) : null}
                {coverLetter ? (
                  <a
                    href={`/api/documents/${coverLetter.id}`}
                    className={buttonClass.primary}
                  >
                    Download Cover Letter
                  </a>
                ) : null}
                <span className="ml-auto text-[11px] text-subtle">
                  .docx · one-page A4 · ATS-safe
                  {fit && !fit.fits ? ` · over by ~${fit.overBy} lines` : ""}
                </span>
              </div>

              {resume?.summary ? (
                <GenerationSummary summary={resume.summary} />
              ) : (
                <p className="px-4 py-3 text-xs text-muted">
                  No summary captured — regenerate to see the classification and gaps.
                </p>
              )}
            </Card>
          )}
        </section>

        {/* --- SimG ------------------------------------------------------- */}
        {evaluation && simgProjection ? (
          <section className="pt-12">
            <SimgWorklist
              applicationId={application.id}
              evaluation={evaluation}
              projection={simgProjection}
              measured={atsMeasured}
            />
          </section>
        ) : null}

        {/* --- On need ---------------------------------------------------- */}
        <section className="pt-12 pb-16">
          <p className="mb-2 text-[11px] tracking-wider text-faint uppercase">On need</p>

          {analysis || scoreReport?.contentMd ? (
            <OnNeed title="Full score analysis" meta="Narrative">
              <div className="flex flex-col gap-4">
                {analysis ? <ScoreBreakdown analysis={analysis} /> : null}
                {analysis?.visaSignals?.length ? (
                  <div>
                    <h3 className="mb-1.5 text-xs font-semibold text-muted">
                      Visa signals
                    </h3>
                    <ul className="flex flex-col gap-1 text-xs text-muted">
                      {analysis.visaSignals.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {scoreReport?.contentMd ? (
                  <div className="text-xs">
                    <Markdown content={scoreReport.contentMd} />
                  </div>
                ) : null}
              </div>
            </OnNeed>
          ) : null}

          <OnNeed title="Job posting & pre-qualification" meta={job.source}>
            <dl className="grid grid-cols-[9rem_1fr] gap-y-1.5 text-xs">
              <dt className="text-subtle">Location</dt>
              <dd>{job.location ?? "—"}</dd>
              <dt className="text-subtle">Posted</dt>
              <dd>{formatDate(job.postedAt)}</dd>
              <dt className="text-subtle">Seniority</dt>
              <dd>{job.seniority ?? "—"}</dd>
              <dt className="text-subtle">Salary</dt>
              <dd>{job.salaryRaw ?? "—"}</dd>
              {/*
                * Reads the gate's verdict, not the old `visaSponsorshipMentioned`
                * flag. That flag was set by a regex in the ingestion adapter
                * which fired on bare "right to work", and it is no longer
                * populated at all (ADR-0006 revision) — leaving it here would
                * have printed "Not mentioned" on every job from now on, which
                * is an assertion nothing supports.
                */}
              <dt className="text-subtle">Sponsorship in posting</dt>
              <dd>
                {gate?.visa
                  ? (VISA_REASON_LABELS[gate.visa.reasonCode] ?? gate.visa.reasonCode)
                  : job.visaSponsorshipMentioned === true
                    ? "Mentioned"
                    : "Not recorded"}
              </dd>
              <dt className="text-subtle">Ingested</dt>
              <dd>
                {job.prequalifiedAt
                  ? formatDateTime(job.prequalifiedAt)
                  : formatDateTime(job.firstSeenAt)}
              </dd>
              {job.ingestionRunId ? (
                <>
                  <dt className="text-subtle">Run</dt>
                  <dd className="font-mono text-[11px]" title={job.ingestionRunId}>
                    {job.ingestionRunId}
                  </dd>
                </>
              ) : null}
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <RawJdDialog
                description={job.description}
                matchedTerms={matchedDomainTerms}
                title={job.title}
                company={job.company}
              />
              <a
                href={job.jobUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline underline-offset-2 hover:text-foreground"
              >
                Original posting ↗
              </a>
            </div>

            {/*
              * JSV2S1165 — the gate's working, on an application that PASSED.
              * It used to be visible only on jobs that were held or screened
              * out, which left the one verdict that spends money as the one
              * verdict nobody could check.
              */}
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-3 text-[11px] tracking-wider text-faint uppercase">
                Pre-qualification verdict
              </p>
              <GateVerdictPanel detail={gate} />
            </div>

            <div className="mt-3 border-t border-line pt-3">
              <ArtworkCredit artwork={artwork} />
            </div>
          </OnNeed>

          <OnNeed
            title="Status, referral & attempts"
            meta={`${application.attempts.length} attempts`}
          >
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader
                  title="Status"
                  meta={
                    application.appliedAt
                      ? `applied ${formatDate(application.appliedAt)}`
                      : undefined
                  }
                />
                <StatusForm applicationId={application.id} current={application.status} />
              </Card>

              <Card>
                <CardHeader title="Referral" />
                <ReferralForm
                  applicationId={application.id}
                  status={application.referralStatus}
                  referrerName={application.referrerName}
                  referralNotes={application.referralNotes}
                />
              </Card>

              <Card>
                <CardHeader title="Attempts" meta={`${application.attempts.length}`} />
                {application.attempts.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted">
                    No attempt recorded. Moving the status to Applied opens attempt 1.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {application.attempts.map((attempt) => (
                      <li key={attempt.id} className="px-4 py-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            Attempt {attempt.attemptNumber}
                          </span>
                          <span className="text-subtle">
                            {formatDate(attempt.appliedAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-muted">
                          {attempt.channel
                            ? `${attempt.channel.replace("_", " ")} · `
                            : ""}
                          {attempt.emailUsed ?? "no email recorded"}
                        </p>
                        {attempt.outcome ? (
                          <p className="mt-1 text-subtle">
                            Outcome: {STATUS_LABELS[attempt.outcome]}
                          </p>
                        ) : null}
                        {attempt.notes ? (
                          <p className="mt-1 text-subtle">{attempt.notes}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <AttemptForm applicationId={application.id} />
              </Card>
            </div>
          </OnNeed>

          <OnNeed
            title="Audit trail & versions"
            meta={`${application.timeline.length} events · ${application.documents.length} versions`}
          >
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader title="Timeline" />
                <NoteForm applicationId={application.id} />
                <ol className="divide-y divide-line">
                  {application.timeline.map((event) => (
                    <li key={event.id} className="flex gap-3 px-4 py-2.5 text-xs">
                      <span className="w-28 shrink-0 text-subtle">
                        {formatDateTime(event.occurredAt)}
                      </span>
                      <span className="min-w-0">{event.summary}</span>
                    </li>
                  ))}
                </ol>
              </Card>

              <Card>
                <CardHeader title="Document versions" />
                {application.documents.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted">Nothing generated yet.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {application.documents.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between gap-2 px-4 py-2 text-xs"
                      >
                        <span>
                          {DOCUMENT_LABELS[doc.docType]}{" "}
                          <span className="text-subtle">v{doc.version}</span>
                        </span>
                        <a
                          href={`/api/documents/${doc.id}`}
                          className="text-muted underline underline-offset-2 hover:text-foreground"
                        >
                          {doc.docType === "score_report" ? ".md" : ".docx"}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </OnNeed>

          <OnNeed title="AI cost" meta="This application">
            <AiCostCard cost={cost} grounding={grounding} />
          </OnNeed>

          <div className="border-t border-line" />
        </section>
      </div>
    </div>
  );
}
