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
import { Badge, buttonClass, Card, CardHeader, EmptyState } from "@/components/ui/base";
import { Markdown } from "@/components/ui/markdown";
import { getApplicationCost } from "@/features/ai/queries";
import { getTaskStates, settleAiJobs } from "@/features/ai/tasks";
import { getApplicationDetail } from "@/features/applications/queries";
import { DOCUMENT_LABELS, STATUS_LABELS } from "@/lib/config/constants";
import { pageFit } from "@/lib/documents/parse";

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
  // than before them: a sequential wave costs a full round trip, which is
  // ~220ms with the database on another continent.
  const [, application, tasks, cost] = await Promise.all([
    settleAiJobs(id),
    getApplicationDetail(id),
    getTaskStates(id),
    getApplicationCost(id),
  ]);

  if (!application) notFound();

  const { job } = application;
  const resume = application.latestDocuments.resume;
  const coverLetter = application.latestDocuments.cover_letter;
  const scoreReport = application.latestDocuments.score_report;
  const blockedReason = application.isIncomplete
    ? "Add the job description first"
    : undefined;

  const taskFor = (type: string) => tasks.find((t) => t.taskType === type);

  return (
    <div className="flex flex-col gap-4">
      {/* -- Header: what is it, where is it, what next -------------------- */}
      <div>
        <Link href="/applications" className="text-xs text-muted hover:text-foreground">
          ← Applications
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{job.title}</h1>
            <p className="text-sm text-muted">
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
              {job.country ? ` · ${job.country}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <MatchBadge category={application.matchCategory} />
            <ReferralBadge status={application.referralStatus} />
            <StatusBadge
              status={application.status}
              isPending={application.isPending}
            />
          </div>
        </div>
        <p className="mt-2 text-xs">
          <span className="text-subtle">Next: </span>
          <span className="font-medium">{application.nextAction}</span>
        </p>
      </div>

      {tasks.length > 0 ? (
        <div className="flex flex-wrap gap-2 rounded-lg border border-line bg-surface-muted px-4 py-2.5 text-xs">
          {tasks.map((task) => (
            <span key={task.id} className="flex items-center gap-1.5">
              <Badge tone={task.status === "failed" ? "negative" : "info"}>
                {task.label}: {task.status}
              </Badge>
              {task.error ? (
                <span className="text-negative">{task.error}</span>
              ) : task.status !== "failed" ? (
                <span className="text-muted">running…</span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* -- Left column ------------------------------------------------ */}
        <div className="flex flex-col gap-4">
          {application.isIncomplete ? (
            <Card>
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

          {/* Job Score (JSV2S1080, JSV2S1081) */}
          <Card>
            <CardHeader
              title="Job Score"
              meta={
                application.jobScoreGeneratedAt
                  ? formatDateTime(application.jobScoreGeneratedAt)
                  : undefined
              }
              action={
                <GenerateButton
                  applicationId={application.id}
                  taskType="score"
                  label="Generate score"
                  disabled={application.isIncomplete || !!taskFor("score")}
                  disabledReason={blockedReason}
                  regenerate={application.jobScore !== null}
                />
              }
            />
            {application.jobScore === null ? (
              <EmptyState
                title="Not scored yet"
                hint="Scoring weighs sponsorship likelihood, domain relevance and experience fit."
              />
            ) : (
              <div className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold tabular-nums">
                    {application.jobScore}
                  </span>
                  <span className="text-xs text-subtle">/ 100</span>
                  <MatchBadge category={application.matchCategory} />
                  {application.visaSignal ? (
                    <Badge tone="info">Visa: {application.visaSignal}</Badge>
                  ) : null}
                </div>

                {application.jobScoreAnalysis?.summary ? (
                  <p className="text-sm">{application.jobScoreAnalysis.summary}</p>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  {application.jobScoreAnalysis?.strengths?.length ? (
                    <div>
                      <h3 className="mb-1 text-xs font-semibold text-muted">
                        Strengths
                      </h3>
                      <ul className="list-disc pl-4 text-xs">
                        {application.jobScoreAnalysis.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {application.jobScoreAnalysis?.gaps?.length ? (
                    <div>
                      <h3 className="mb-1 text-xs font-semibold text-muted">Gaps</h3>
                      <ul className="list-disc pl-4 text-xs">
                        {application.jobScoreAnalysis.gaps.map((g, i) => (
                          <li key={i}>{g}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                {/* Detail lives behind the disclosure so the card stays a summary. */}
                {application.jobScoreAnalysis?.breakdown ||
                application.jobScoreAnalysis?.visaSignals?.length ||
                scoreReport?.contentMd ? (
                  <details className="border-t border-line pt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">
                      Full score analysis
                    </summary>

                    <div className="mt-3 flex flex-col gap-4">
                      {application.jobScoreAnalysis ? (
                        <ScoreBreakdown analysis={application.jobScoreAnalysis} />
                      ) : null}

                      {application.jobScoreAnalysis?.visaSignals?.length ? (
                        <div>
                          <h3 className="mb-1.5 text-xs font-semibold text-muted">
                            Visa signals
                          </h3>
                          <ul className="flex flex-col gap-1 text-xs">
                            {application.jobScoreAnalysis.visaSignals.map((signal, i) => (
                              <li
                                key={i}
                                className="relative pl-4 before:absolute before:left-0 before:top-[0.5em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-info"
                              >
                                {signal}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {scoreReport?.contentMd ? (
                        <div className="border-t border-line pt-3">
                          <Markdown content={scoreReport.contentMd} />
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </div>
            )}
          </Card>

          {/* Resume docs (JSV2S1078, JSV2S1079) — one CVG call writes both,
              and both carry the same analysis, so it is shown once. */}
          <Card>
            <CardHeader
              title="Resume docs"
              meta={resume ? `v${resume.version} · ${resume.model ?? resume.generatedBy}` : undefined}
              action={
                <div className="flex items-center gap-2">
                  {resume?.contentMd
                    ? (() => {
                        const fit = pageFit(resume.contentMd);
                        return fit.fits ? (
                          <Badge tone="positive" title={`~${fit.estimatedLines} lines`}>
                            Fits one page
                          </Badge>
                        ) : (
                          <Badge
                            tone="negative"
                            title={`~${fit.estimatedLines} lines against ~72 on an A4 page — regenerate to cut content`}
                          >
                            Over by ~{fit.overBy}
                          </Badge>
                        );
                      })()
                    : null}
                  <GenerateButton
                    applicationId={application.id}
                    taskType="tailor_cv"
                    label="Generate CV + CL"
                    disabled={application.isIncomplete || !!taskFor("tailor_cv")}
                    disabledReason={blockedReason}
                    regenerate={!!resume}
                  />
                </div>
              }
            />

            {!resume && !coverLetter ? (
              <EmptyState
                title="No documents yet"
                hint="One pass writes the tailored CV and its cover letter together."
              />
            ) : (
              <>
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
                  </span>
                </div>

                {/* The summary describes the pair, so it appears once. */}
                {resume?.summary ? (
                  <GenerationSummary summary={resume.summary} />
                ) : (
                  <p className="px-4 py-3 text-xs text-muted">
                    No summary captured — regenerate to see the match uplift and gaps.
                  </p>
                )}
              </>
            )}
          </Card>

          {/* Timeline (JSV2S1084 + JSV2S1097) */}
          <Card>
            <CardHeader title="Timeline" meta={`${application.timeline.length} events`} />
            <NoteForm applicationId={application.id} />
            <ol className="divide-y divide-line">
              {application.timeline.map((event) => (
                <li key={event.id} className="flex gap-3 px-4 py-2.5 text-xs">
                  <span className="w-28 shrink-0 text-subtle">
                    {formatDateTime(event.occurredAt)}
                  </span>
                  <span className="flex-1">{event.summary}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* -- Right column ----------------------------------------------- */}
        <aside className="flex flex-col gap-4">
          {/* Job Context (JSV2S1077) */}
          <Card>
            <CardHeader title="Job" meta={job.source} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 p-4 text-xs">
              <dt className="text-subtle">Posted</dt>
              <dd>{formatDate(job.postedAt)}</dd>
              <dt className="text-subtle">Seniority</dt>
              <dd>{job.seniority ?? "—"}</dd>
              <dt className="text-subtle">Type</dt>
              <dd>{job.employmentType ?? "—"}</dd>
              <dt className="text-subtle">Salary</dt>
              <dd>{job.salaryRaw ?? "—"}</dd>
              <dt className="text-subtle">Sponsorship</dt>
              <dd>
                {job.visaSponsorshipMentioned === null
                  ? "—"
                  : job.visaSponsorshipMentioned
                    ? "Mentioned"
                    : "Not mentioned"}
              </dd>
              {job.inboundSourceDetail ? (
                <>
                  <dt className="text-subtle">Lead</dt>
                  <dd>{job.inboundSourceDetail}</dd>
                </>
              ) : null}
            </dl>
            <div className="flex flex-wrap gap-3 border-t border-line px-4 py-2.5 text-xs">
              <a
                href={job.jobUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Original posting ↗
              </a>
              {job.externalApplyUrl ? (
                <a
                  href={job.externalApplyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Apply directly ↗
                </a>
              ) : null}
            </div>
          </Card>

          {/* Status (JSV2S1082–1084) */}
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

          {/* Referral (JSV2S1086–1088) */}
          <Card>
            <CardHeader title="Referral" />
            <ReferralForm
              applicationId={application.id}
              status={application.referralStatus}
              referrerName={application.referrerName}
              referralNotes={application.referralNotes}
            />
          </Card>

          {/* Attempts (JSV2S1094–1096) */}
          <Card>
            <CardHeader
              title="Attempts"
              meta={`${application.attempts.length}`}
            />
            {application.attempts.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted">
                No attempt recorded. Moving the status to Applied opens attempt 1.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {application.attempts.map((attempt) => (
                  <li key={attempt.id} className="px-4 py-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">Attempt {attempt.attemptNumber}</span>
                      <span className="text-subtle">
                        {formatDate(attempt.appliedAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-muted">
                      {attempt.channel ? `${attempt.channel.replace("_", " ")} · ` : ""}
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

          <AiCostCard cost={cost} />
        </aside>
      </div>
    </div>
  );
}
