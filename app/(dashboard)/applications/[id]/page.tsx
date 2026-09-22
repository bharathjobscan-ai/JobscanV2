import Link from "next/link";
import { notFound } from "next/navigation";

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
import { OnNeed, ScoreHero } from "@/components/applications/score-hero";
import {
  FigureRow,
  type Figure,
} from "@/components/applications/detail/overview/figure-row";
import { VerdictBlock } from "@/components/applications/detail/overview/verdict";
import { StrategyPanel } from "@/components/applications/detail/overview/strategy";
import { Basis } from "@/components/applications/detail/analysis/basis";
import {
  AnalysisEmpty,
  AnalysisHead,
} from "@/components/applications/detail/analysis/head";
import { DetailTabs, type DetailTab } from "@/components/applications/detail/tabs";
import {
  Fact,
  Panel,
  PanelGrid,
  SectionHead,
} from "@/components/applications/detail/section";
import { Badge, buttonClass, Card, CardHeader } from "@/components/ui/base";
import { Markdown } from "@/components/ui/markdown";
import { getApplicationCost } from "@/features/ai/queries";
import { getGroundingUsage } from "@/features/ai/budget-queries";
import { getTaskStates, settleAiJobs } from "@/features/ai/tasks";
import { getApplicationDetail } from "@/features/applications/queries";
import {
  DOCUMENT_LABELS,
  MATCH_HINTS,
  type MatchCategory,
  MATCH_LABELS,
  REFERRAL_LABELS,
  STATUS_LABELS,
} from "@/lib/config/constants";
import { pageFit } from "@/lib/documents/parse";
import { applyAccepted, project } from "@/features/simg/apply";
import { measureAts } from "@/features/simg/measure";
import { resolveArtwork } from "@/features/artwork/resolve";
import { buildLedger } from "@/features/scoring/ledger";
import { GateVerdictPanel } from "@/components/applications/gate-verdict";
import { DemoteForm } from "@/components/applications/demote-form";
import { VISA_REASON_LABELS } from "@/features/prequalification/labels";
import {
  PREQUALIFICATION_LABELS,
  type PrequalDecision,
} from "@/lib/config/constants";
import type { ScoreLineItem } from "@/db/schema";
import type { ComponentProps } from "react";

type GateDetail = NonNullable<ComponentProps<typeof GateVerdictPanel>["detail"]>;

/**
 * The application workspace, rebuilt to the Nocturnal design (JSV2S1139,
 * restyled JSV2S1172).
 *
 * The page answers one question — apply or not — so the masthead carries the
 * posting and its score, and nothing else competes with them. Beneath that the
 * screen is six readings of the same application, separated into tabs rather
 * than stacked: the figures, the material, SimG, the arithmetic, the reference
 * detail and the audit trail.
 *
 * NOTHING WAS REMOVED by the tabs — every panel is rendered and hidden with
 * `hidden`, so an in-flight server action survives a tab switch and the whole
 * page is still one text search away.
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

/**
 * "3 days old", from whichever date the posting actually has.
 *
 * `postedAt` where the source gave one, otherwise the day we first saw it —
 * labelled differently, because "first seen" is a fact about us and "posted" is
 * a fact about the job, and conflating them would overstate what we know.
 */
function postingAge(
  postedAt: string | null,
  firstSeenAt: Date | null,
): string | null {
  const from = postedAt ? new Date(`${postedAt}T00:00:00Z`) : firstSeenAt;
  if (!from || Number.isNaN(from.getTime())) return null;
  const days = Math.max(0, Math.floor((Date.now() - from.getTime()) / 86_400_000));
  const age = days === 0 ? "today" : days === 1 ? "1 day old" : `${days} days old`;
  return postedAt ? age : days === 0 ? "seen today" : `seen ${days} days ago`;
}

/**
 * The band's own advice, as the strategy row's "Approach".
 *
 * `MATCH_HINTS` reads "70-84 · Apply and seek a referral in parallel"; the
 * range belongs to the masthead pill, so only the advice half is taken, with
 * its first letter raised to start a sentence.
 */
function bandAdvice(category: MatchCategory): string {
  const advice = MATCH_HINTS[category].split(" · ")[1] ?? MATCH_HINTS[category];
  return advice.charAt(0).toUpperCase() + advice.slice(1);
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

  /**
   * The four figures: the facts the score rests on, at a glance.
   *
   * The design's row is Visa signal / Document score / Reachability / AI cost.
   * Three of those are figures this system measures. Reachability is a real
   * ScoreG line item — it is scored inside Job Relevance — so it is read out of
   * the breakdown by name rather than invented; where a run did not produce one
   * the column falls back to the referral record, which is the only other
   * reachability fact stored.
   */
  const lineItems: ScoreLineItem[] = Array.isArray(analysis?.breakdown)
    ? analysis.breakdown
    : [];
  const reachability = lineItems.find((item) => /reachab/i.test(item.component));
  const visaScore = ledger?.pillars.find((p) => p.key === "visa")?.score ?? null;
  const models = new Set(cost.runs.map((r) => r.model).filter(Boolean)).size;

  const reachabilityFigure: Figure = reachability
    ? {
        label: "Reachability",
        value:
          reachability.max <= 0 || reachability.awarded / reachability.max >= 0.8
            ? "Strong"
            : reachability.awarded / reachability.max >= 0.4
              ? "Partial"
              : reachability.awarded > 0
                ? "Weak"
                : "None",
        hint: `${reachability.awarded} of ${reachability.max}`,
        tone:
          reachability.max > 0 && reachability.awarded / reachability.max >= 0.8
            ? "positive"
            : reachability.awarded > 0
              ? "warning"
              : "negative",
        to: "analysis",
      }
    : {
        label: "Referral",
        value: REFERRAL_LABELS[application.referralStatus],
        hint: application.referrerName ?? undefined,
        tone: application.referralStatus === "needed" ? "warning" : undefined,
      };

  const figures: Figure[] = [
    {
      label: "Visa signal",
      value: application.visaSignal ?? "Not established",
      hint: analysis?.visaSignals?.length
        ? `${analysis.visaSignals.length} source${analysis.visaSignals.length === 1 ? "" : "s"}`
        : undefined,
      tone:
        visaScore === null
          ? application.visaSignal
            ? undefined
            : "negative"
          : visaScore >= 70
            ? "positive"
            : visaScore >= 40
              ? "warning"
              : "negative",
      to: analysis ? "analysis" : undefined,
    },
    {
      label: "Document score",
      value: simgProjection
        ? `${simgProjection.baseline} → ${simgProjection.current}`
        : "—",
      hint: simgProjection
        ? `${simgProjection.acceptedCount} SimG edit${simgProjection.acceptedCount === 1 ? "" : "s"}`
        : "No CV generated",
      hintTone: simgProjection && simgProjection.acceptedCount > 0 ? "positive" : undefined,
      to: simgProjection ? "simg" : undefined,
    },
    reachabilityFigure,
    {
      label: "AI cost",
      value: cost.runs.length === 0 ? "—" : `$${cost.totalUsd.toFixed(2)}`,
      hint:
        cost.runs.length === 0
          ? "Nothing spent yet"
          : `${cost.runs.length} run${cost.runs.length === 1 ? "" : "s"} · ${models} model${
              models === 1 ? "" : "s"
            }`,
      tone: cost.runs.length === 0 ? undefined : "accent",
      to: "activity",
    },
  ];

  const fit = derivedCv ? pageFit(derivedCv) : null;

  /*
   * Each generate action sits where its result does (2026-09-23).
   *
   * Both used to sit in the masthead beside the role, where they read as two
   * identical "Regenerate" buttons with nothing to say which was which. The
   * score belongs to Overview and the documents to Material, and an action
   * next to the thing it changes needs no label to disambiguate it.
   */
  const scoreAction = (
    <GenerateButton
      applicationId={application.id}
      taskType="score"
      label="Generate score"
      disabled={application.isIncomplete || !!taskFor("score")}
      disabledReason={blockedReason}
      regenerate={application.jobScore !== null}
    />
  );

  const materialAction = (
    <GenerateButton
      applicationId={application.id}
      taskType="tailor_cv"
      label="Generate CV + CL"
      disabled={application.isIncomplete || !!taskFor("tailor_cv")}
      disabledReason={blockedReason}
      regenerate={!!resume}
    />
  );

  /**
   * The design's "Application strategy" block, filled from what this app
   * actually knows.
   *
   * No invented approach or outreach copy: "Approach" is the band's own advice
   * from `MATCH_HINTS`, "Outreach" is the referral record plus whatever the
   * scorer wrote about reachability, and "Next action" is the derived next
   * action with the status behind it.
   */
  const strategyRows = [
    {
      label: "Approach",
      value: application.matchCategory ? bandAdvice(application.matchCategory) : null,
    },
    {
      label: "Outreach",
      value: [
        REFERRAL_LABELS[application.referralStatus],
        application.referrerName,
        reachability?.reason,
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      label: "Next action",
      value: [
        application.nextAction,
        `${STATUS_LABELS[application.status]}${application.isPending ? ", deemed pending" : ""}`,
        application.appliedAt ? `applied ${formatDate(application.appliedAt)}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];

  const overview = (
    <>
      <VerdictBlock
        matchCategory={application.matchCategory}
        summary={analysis?.summary}
        hasAnalysis={Boolean(analysis || ledger || scoreReport?.contentMd)}
        hasMaterial={Boolean(resume || coverLetter)}
      />

      <div className="mt-7">
        <FigureRow figures={figures} />
      </div>

      <StrategyPanel rows={strategyRows} />

      {/* The score's own action, beside the verdict it produces. */}
      <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
        {scoreAction}
      </div>
    </>
  );

  const material = (
    <section>
      <SectionHead title="Material" meta="Generated on qualification" />

      {!resume && !coverLetter ? (
        <div className="mt-5">
          <p className="max-w-[60ch] text-[13.5px] text-muted">
            Nothing generated yet. One pass writes the tailored CV and its cover
            letter together.
          </p>
          {/* The action, not just a description of it — a tab that explains
              what would fill it and then makes you go elsewhere to do it is a
              dead end. */}
          <div className="mt-4 flex flex-wrap gap-2">{materialAction}</div>
        </div>
      ) : (
        <>
          <PanelGrid min="210px" className="mt-5">
            {resume ? (
              <Panel label="Tailored resume">
                <p className="n-display mt-1.5 text-[19px] font-semibold">
                  v{resume.version} ready
                </p>
                <p className="mt-1 text-[11.5px] text-faint">
                  .docx · one-page A4 · ATS-safe
                  {fit && !fit.fits ? ` · over by ~${fit.overBy} lines` : ""}
                </p>
                <a
                  href={`/api/documents/${resume.id}`}
                  className={`${buttonClass.secondary} mt-3.5`}
                >
                  Download CV
                </a>
              </Panel>
            ) : null}

            {coverLetter ? (
              <Panel label="Cover letter">
                <p className="n-display mt-1.5 text-[19px] font-semibold">
                  v{coverLetter.version} ready
                </p>
                <p className="mt-1 text-[11.5px] text-faint">
                  .docx · addressed to the team
                </p>
                <a
                  href={`/api/documents/${coverLetter.id}`}
                  className={`${buttonClass.secondary} mt-3.5`}
                >
                  Download Cover Letter
                </a>
              </Panel>
            ) : null}

            {simgProjection ? (
              <Panel label="Document score">
                <p className="n-display mt-1.5 text-[19px] font-semibold tabular-nums">
                  {simgProjection.current}
                </p>
                <p className="mt-1 text-[11.5px] text-faint tabular-nums">
                  {simgProjection.baseline} before tailoring ·{" "}
                  {simgProjection.acceptedCount} edit
                  {simgProjection.acceptedCount === 1 ? "" : "s"} applied
                </p>
              </Panel>
            ) : null}
          </PanelGrid>

          <div className="mt-7">
            {resume?.summary ? (
              <GenerationSummary summary={resume.summary} />
            ) : (
              <p className="text-[13.5px] text-muted">
                No summary captured — regenerate to see the classification and gaps.
              </p>
            )}
          </div>

          {/* Regenerating belongs here too, where the documents it replaces
              are, rather than in a masthead two sections up. */}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
            {materialAction}
          </div>
        </>
      )}
    </section>
  );

  const hasAnalysisContent = Boolean(analysis || ledger || scoreReport?.contentMd);

  const fullAnalysis = (
    <section>
      <AnalysisHead />

      <div className="mt-7 flex flex-col gap-8">
        {!hasAnalysisContent ? (
          <AnalysisEmpty
            gateQualified={application.matchCategory === "gate_qualified"}
            isIncomplete={application.isIncomplete}
          />
        ) : null}

        {analysis ? <ScoreBreakdown analysis={analysis} /> : null}

        {/* The arithmetic. A score you cannot audit is one you cannot argue with. */}
        {ledger ? (
          <ScoreLedgerTable
            ledger={ledger}
            finalCalculation={analysis?.finalCalculation}
            aside={
              <>
                <p className="text-[10px] tracking-[0.16em] text-accent uppercase">
                  What that means
                </p>
                <p className="n-display mt-2.5 text-[21px] leading-tight font-semibold">
                  {application.matchCategory
                    ? MATCH_LABELS[application.matchCategory]
                    : "Unbanded"}
                </p>
                {analysis?.summary ? (
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">
                    {analysis.summary}
                  </p>
                ) : null}
                {application.matchCategory ? (
                  <p className="mt-3 text-[11.5px] text-faint">
                    {MATCH_HINTS[application.matchCategory]}
                  </p>
                ) : null}
              </>
            }
          />
        ) : null}

        {analysis?.strengths?.length || analysis?.gaps?.length ? (
          <Basis holding={analysis.strengths ?? []} failing={analysis.gaps ?? []} />
        ) : null}

        {analysis?.visaSignals?.length ? (
          <div
            className="border-l-2 pl-5"
            style={{ borderColor: "var(--emerald)" }}
          >
            <p className="text-[10px] tracking-[0.16em] text-positive uppercase">
              Visa assessment
            </p>
            <ul className="mt-2.5 flex max-w-[70ch] flex-col gap-2 text-[14px] leading-relaxed text-muted">
              {analysis.visaSignals.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {scoreReport?.contentMd ? (
          <div className="text-[13px]">
            <Markdown content={scoreReport.contentMd} />
          </div>
        ) : null}
      </div>
    </section>
  );

  const onNeed = (
    <section>
      <p className="pb-2 text-[10px] tracking-[0.16em] text-faint uppercase">On need</p>

      {/*
        * JSV2S1165 — its own section, not a footnote inside the posting.
        *
        * It was nested under "Job posting", which is collapsed by default,
        * so the verdict that decides whether a job is worth money was two
        * clicks from view. Open by default where there is no score, because
        * then this IS the result.
        */}
      <OnNeed
        title="Pre-qualification"
        meta={
          gate?.decision
            ? (PREQUALIFICATION_LABELS[gate.decision as PrequalDecision] ?? gate.decision)
            : undefined
        }
        open={application.jobScore === null}
      >
        <GateVerdictPanel detail={gate} />

        {/*
          * Out of one verdict and into the population it belongs to.
          *
          * A single job's verdict is only half the question — "is this
          * right" is usually answered by looking at everything else the
          * same rule did. These are the two axes worth one click: the
          * company, and the sentence-level visa outcome.
          */}
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-line pt-3.5 text-[12.5px]">
          <Link
            href={`/applications?company=${encodeURIComponent(job.company)}`}
            className="text-muted underline underline-offset-2 hover:text-foreground"
          >
            All applications at {job.company}
          </Link>
          {gate?.visa?.reasonCode ? (
            <Link
              href={`/review?visa=${encodeURIComponent(gate.visa.reasonCode)}`}
              className="text-muted underline underline-offset-2 hover:text-foreground"
            >
              Everything else judged “
              {VISA_REASON_LABELS[gate.visa.reasonCode] ?? gate.visa.reasonCode}”
            </Link>
          ) : null}
          {gate?.watchlist ? (
            <Link
              href={`/review?company=${encodeURIComponent(job.company)}`}
              className="text-muted underline underline-offset-2 hover:text-foreground"
            >
              {job.company} in the queue
            </Link>
          ) : null}
        </div>
      </OnNeed>

      <OnNeed title="Job posting" meta={job.source}>
        <PanelGrid min="190px">
          <Fact label="Location" value={job.location ?? "—"} />
          <Fact label="Posted" value={formatDate(job.postedAt)} />
          <Fact label="Seniority" value={job.seniority ?? "—"} />
          <Fact label="Salary" value={job.salaryRaw ?? "—"} />
          {/*
            Reads the gate's verdict, not the old `visaSponsorshipMentioned`
            flag. That flag was set by a regex in the ingestion adapter which
            fired on bare "right to work", and it is no longer populated at all
            (ADR-0006 revision) — leaving it here would have printed "Not
            mentioned" on every job from now on, which is an assertion nothing
            supports.
          */}
          <Fact
            label="Sponsorship in posting"
            value={
              gate?.visa
                ? (VISA_REASON_LABELS[gate.visa.reasonCode] ?? gate.visa.reasonCode)
                : job.visaSponsorshipMentioned === true
                  ? "Mentioned"
                  : "Not recorded"
            }
          />
          <Fact
            label="Ingested"
            value={
              job.prequalifiedAt
                ? formatDateTime(job.prequalifiedAt)
                : formatDateTime(job.firstSeenAt)
            }
          />
        </PanelGrid>

        <div className="mt-4 flex flex-wrap items-center gap-4">
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
            className="text-[12.5px] underline underline-offset-2 hover:text-foreground"
          >
            Original posting ↗
          </a>
          {job.ingestionRunId ? (
            <span
              className="n-mono ml-auto text-[11.5px] text-faint"
              title={job.ingestionRunId}
            >
              Run {job.ingestionRunId}
            </span>
          ) : null}
        </div>

        <div className="mt-4 border-t border-line pt-3.5">
          <ArtworkCredit artwork={artwork} />
        </div>
      </OnNeed>

      <OnNeed title="Remove from applications" meta="Sends it back to a pile">
        <DemoteForm applicationId={application.id} />
      </OnNeed>
    </section>
  );

  const activity = (
    <section>
      <p className="pb-2 text-[10px] tracking-[0.16em] text-faint uppercase">Activity</p>

      <OnNeed
        title="Status, referral & attempts"
        meta={`${STATUS_LABELS[application.status]} · ${application.attempts.length} attempt${
          application.attempts.length === 1 ? "" : "s"
        }`}
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
                      <span className="font-medium">Attempt {attempt.attemptNumber}</span>
                      <span className="n-mono text-subtle">
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
        </div>
      </OnNeed>

      <OnNeed
        title="Audit trail & versions"
        meta={`${application.timeline.length} events · ${application.documents.length} versions`}
      >
        <div className="grid gap-x-10 gap-y-7 lg:grid-cols-2">
          <div>
            <p className="pb-2.5 text-[10px] tracking-[0.14em] text-faint uppercase">
              Events
            </p>
            <NoteForm applicationId={application.id} />
            <ol className="mt-3">
              {application.timeline.map((event) => (
                <li
                  key={event.id}
                  className="grid grid-cols-[11px_minmax(0,1fr)] gap-3 pb-3.5"
                >
                  <span className="flex flex-col items-center">
                    <span
                      aria-hidden
                      className="mt-1.5 size-[7px] shrink-0 rounded-full"
                      style={{ background: "var(--slate)" }}
                    />
                    <span className="w-px flex-1 bg-line" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px]">{event.summary}</span>
                    <span className="n-mono block text-[11.5px] text-faint">
                      {formatDateTime(event.occurredAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p className="pb-2.5 text-[10px] tracking-[0.14em] text-faint uppercase">
              Versions
            </p>
            {application.documents.length === 0 ? (
              <p className="text-[13.5px] text-muted">Nothing generated yet.</p>
            ) : (
              <ul>
                {application.documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-baseline gap-3 border-b py-2.5"
                    style={{ borderColor: "var(--hair)" }}
                  >
                    <span className="text-[13.5px]">{DOCUMENT_LABELS[doc.docType]}</span>
                    <span className="n-mono text-[11.5px] text-faint">v{doc.version}</span>
                    <a
                      href={`/api/documents/${doc.id}`}
                      className="ml-auto text-[12.5px] text-muted underline underline-offset-2 hover:text-foreground"
                    >
                      {doc.docType === "score_report" ? ".md" : ".docx"}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11.5px] text-faint">
              Every version is retained. Nothing here is overwritten or deleted.
            </p>
          </div>
        </div>
      </OnNeed>

      <OnNeed title="AI cost for this application" meta="Per run, per model">
        <AiCostCard cost={cost} grounding={grounding} />
      </OnNeed>
    </section>
  );

  const tabs: DetailTab[] = [
    { id: "overview", label: "Overview", content: overview },
    {
      id: "material",
      label: "Material",
      meta: resume ? `v${resume.version}` : undefined,
      content: material,
    },
  ];

  /*
   * SimG is always a tab (2026-09-23).
   *
   * It used to appear only once an evaluation existed, so on every application
   * in this database — none of which has a generated document — the tab was
   * simply absent. A missing tab reads as a feature that does not exist; a tab
   * that says what would fill it, and offers the button that fills it, reads as
   * one that has not run yet.
   */
  tabs.push({
    id: "simg",
    label: "SimG",
    meta:
      evaluation && simgProjection && simgProjection.pendingCount > 0
        ? `${simgProjection.pendingCount}`
        : undefined,
    content:
      evaluation && simgProjection ? (
        <SimgWorklist
          applicationId={application.id}
          evaluation={evaluation}
          projection={simgProjection}
          measured={atsMeasured}
        />
      ) : (
        <section>
          <SectionHead
            title="SimG · three lenses on the resume"
            meta="Runs after a CV exists"
          />
          <p className="mt-5 max-w-[68ch] text-[13.5px] text-muted">
            SimG reads the resume as an ATS parser, as a recruiter with six
            seconds, and as the hiring manager. Every edit shows the line it
            replaces — accept and the score moves, discard and nothing changes.
            It has nothing to read until a CV has been generated.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">{materialAction}</div>
        </section>
      ),
  });

  /*
   * Always present, even with nothing to show (2026-09-23).
   *
   * A gate-qualified application has no score and therefore no breakdown, and
   * the tab disappearing left the reader wondering whether the arithmetic was
   * hidden or never run. It says which.
   */
  tabs.push({ id: "analysis", label: "Analysis", content: fullAnalysis });

  tabs.push({ id: "on-need", label: "On need", content: onNeed });
  tabs.push({
    id: "activity",
    label: "Activity",
    meta: `${application.timeline.length}`,
    content: activity,
  });

  return (
    <div className="relative">
      <ArtworkBackdrop artwork={artwork} />

      <div className="relative z-10 mx-auto max-w-6xl">
        <Link
          href="/applications"
          className="inline-block py-1 text-[12.5px] text-muted hover:text-foreground"
        >
          ← Applications
        </Link>

        {tasks.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-line bg-surface-muted px-4 py-2.5 text-xs">
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
          <Card className="mt-3">
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

        <ScoreHero
          score={application.jobScore}
          matchCategory={application.matchCategory}
          company={job.company}
          location={job.location}
          age={postingAge(job.postedAt, job.firstSeenAt)}
          title={job.title}
        />

        {/*
          Where there is no score, the gate's working IS the result (JSV2S1165)
          — so the tab holding it opens first. Burying it one tab AND one
          disclosure deep would hide the whole verdict, which is the mistake
          this section was pulled out of "Job posting" to fix.
        */}
        <DetailTabs
          tabs={tabs}
          initial={application.jobScore === null ? "on-need" : "overview"}
        />
      </div>
    </div>
  );
}
