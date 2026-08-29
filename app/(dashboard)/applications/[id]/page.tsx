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
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/base";
import { Markdown } from "@/components/ui/markdown";
import { getTaskStates, settleAiJobs } from "@/features/ai/tasks";
import { getApplicationDetail } from "@/features/applications/queries";
import { DOCUMENT_LABELS, STATUS_LABELS } from "@/lib/config/constants";

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

  await settleAiJobs(id);

  const [application, tasks] = await Promise.all([
    getApplicationDetail(id),
    getTaskStates(id),
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
                <span className="text-muted">
                  waiting for the local worker — run{" "}
                  <code className="font-mono">npm run worker</code>
                </span>
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

                {/* Pillar-by-pillar working, so the number is auditable. */}
                {application.jobScoreAnalysis?.breakdown &&
                Object.keys(application.jobScoreAnalysis.breakdown).length > 0 ? (
                  <div className="border-t border-line pt-3">
                    <h3 className="mb-1.5 text-xs font-semibold text-muted">
                      Score breakdown
                    </h3>
                    <dl className="flex flex-col gap-1.5">
                      {Object.entries(application.jobScoreAnalysis.breakdown).map(
                        ([key, value]) => (
                          <div
                            key={key}
                            className="grid grid-cols-[9rem_1fr] gap-2 text-xs"
                          >
                            <dt className="font-medium capitalize text-muted">
                              {key.replace(/([a-z])([A-Z])/g, "$1 $2")}
                            </dt>
                            <dd className="tabular-nums">{String(value)}</dd>
                          </div>
                        ),
                      )}
                    </dl>
                  </div>
                ) : null}

                {application.jobScoreAnalysis?.visaSignals?.length ? (
                  <div className="border-t border-line pt-3">
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
                  <details className="border-t border-line pt-3" open>
                    <summary className="cursor-pointer text-xs font-medium text-muted">
                      Full score analysis
                    </summary>
                    <div className="mt-3">
                      <Markdown content={scoreReport.contentMd} />
                    </div>
                  </details>
                ) : null}
              </div>
            )}
          </Card>

          {/* Resume & Cover Letter (JSV2S1078, JSV2S1079) */}
          {(["resume", "cover_letter"] as const).map((docType) => {
            const doc = docType === "resume" ? resume : coverLetter;
            const taskType = docType === "resume" ? "tailor_cv" : "cover_letter";
            return (
              <Card key={docType}>
                <CardHeader
                  title={DOCUMENT_LABELS[docType]}
                  meta={doc ? `v${doc.version} · ${doc.generatedBy}` : undefined}
                  action={
                    <div className="flex items-center gap-2">
                      {doc ? (
                        <>
                          <a
                            href={`/api/documents/${doc.id}`}
                            className="text-xs font-medium underline underline-offset-2 hover:text-foreground"
                            title="Rendered to the CVG formatting rules: one-page A4, single column, no tables"
                          >
                            Download .docx
                          </a>
                          <a
                            href={`/api/documents/${doc.id}?format=md`}
                            className="text-xs text-subtle underline underline-offset-2 hover:text-foreground"
                            title="Raw draft"
                          >
                            .md
                          </a>
                        </>
                      ) : null}
                      <GenerateButton
                        applicationId={application.id}
                        taskType={taskType}
                        label={`Generate ${docType === "resume" ? "resume" : "letter"}`}
                        disabled={application.isIncomplete || !!taskFor(taskType)}
                        disabledReason={blockedReason}
                        regenerate={!!doc}
                      />
                    </div>
                  }
                />
                {doc?.contentMd ? (
                  <div className="p-4">
                    <Markdown content={doc.contentMd} />
                  </div>
                ) : (
                  <EmptyState
                    title={`No ${DOCUMENT_LABELS[docType].toLowerCase()} yet`}
                    hint="Generated on demand, tailored to this job."
                  />
                )}
              </Card>
            );
          })}

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
        </aside>
      </div>
    </div>
  );
}
