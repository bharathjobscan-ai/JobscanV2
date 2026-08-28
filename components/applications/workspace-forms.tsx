"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Field, inputClass } from "@/components/ui/base";
import {
  addNoteAction,
  changeStatusAction,
  createAttemptAction,
  generateAction,
  updateDescriptionAction,
  updateReferralAction,
  type ActionState,
} from "@/features/applications/actions";
import {
  APPLICATION_CHANNELS,
  APPLICATION_STATUSES,
  REFERRAL_STATUSES,
  REFERRAL_LABELS,
  STATUS_LABELS,
  type AiTaskType,
  type ApplicationStatus,
  type ReferralStatus,
} from "@/lib/config/constants";

const EMPTY: ActionState = {};

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-xs text-negative">{state.error}</p>;
  if (state.message) return <p className="text-xs text-positive">{state.message}</p>;
  return null;
}

function Submit({
  children,
  variant = "secondary",
  pendingLabel,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </Button>
  );
}

export function StatusForm({
  applicationId,
  current,
}: {
  applicationId: string;
  current: ApplicationStatus;
}) {
  const [state, action] = useActionState(changeStatusAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-2 p-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      <div className="flex gap-2">
        <select
          name="status"
          defaultValue={current}
          className={`${inputClass} text-xs`}
          aria-label="Application status"
        >
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <Submit variant="primary">Update</Submit>
      </div>
      <input
        name="note"
        placeholder="Optional note for the timeline"
        className={`${inputClass} text-xs`}
      />
      <Feedback state={state} />
    </form>
  );
}

export function ReferralForm({
  applicationId,
  status,
  referrerName,
  referralNotes,
}: {
  applicationId: string;
  status: ReferralStatus;
  referrerName: string | null;
  referralNotes: string | null;
}) {
  const [state, action] = useActionState(updateReferralAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-2 p-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      <select
        name="referralStatus"
        defaultValue={status}
        className={`${inputClass} text-xs`}
        aria-label="Referral status"
      >
        {REFERRAL_STATUSES.map((value) => (
          <option key={value} value={value}>
            {REFERRAL_LABELS[value]}
          </option>
        ))}
      </select>
      <input
        name="referrerName"
        defaultValue={referrerName ?? ""}
        placeholder="Referrer name"
        className={`${inputClass} text-xs`}
      />
      <textarea
        name="referralNotes"
        defaultValue={referralNotes ?? ""}
        rows={2}
        placeholder="Notes"
        className={`${inputClass} text-xs`}
      />
      <div className="flex items-center gap-2">
        <Submit>Save referral</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function AttemptForm({ applicationId }: { applicationId: string }) {
  const [state, action] = useActionState(createAttemptAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-2 border-t border-line p-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      <p className="text-xs text-muted">
        Record a fresh attempt at this job — a later application, often from a
        different address, is tracked separately so you can compare outcomes.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Channel">
          <select name="channel" className={`${inputClass} text-xs`} defaultValue="">
            <option value="">Unspecified</option>
            {APPLICATION_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {channel.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Email used">
          <input
            name="emailUsed"
            type="email"
            placeholder="you@example.com"
            className={`${inputClass} text-xs`}
          />
        </Field>
      </div>
      <input name="notes" placeholder="Notes" className={`${inputClass} text-xs`} />
      <div className="flex items-center gap-2">
        <Submit>Record attempt</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function NoteForm({ applicationId }: { applicationId: string }) {
  const [state, action] = useActionState(addNoteAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-2 border-b border-line p-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      <div className="flex gap-2">
        <input
          name="note"
          placeholder="Add a note to the timeline"
          className={`${inputClass} text-xs`}
        />
        <Submit>Add</Submit>
      </div>
      <Feedback state={state} />
    </form>
  );
}

/** Unblocks AI generation for a job uploaded without its description. */
export function DescriptionForm({
  applicationId,
  rawJobId,
  current,
}: {
  applicationId: string;
  rawJobId: string;
  current: string | null;
}) {
  const [state, action] = useActionState(updateDescriptionAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-2 p-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="rawJobId" value={rawJobId} />
      <textarea
        name="description"
        rows={8}
        defaultValue={current ?? ""}
        placeholder="Paste the full job description here. Scoring and CV tailoring need it."
        className={`${inputClass} text-xs`}
      />
      <div className="flex items-center gap-2">
        <Submit variant="primary">Save description</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function GenerateButton({
  applicationId,
  taskType,
  label,
  disabled,
  disabledReason,
  regenerate,
}: {
  applicationId: string;
  taskType: AiTaskType;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  regenerate?: boolean;
}) {
  const [state, action] = useActionState(generateAction, EMPTY);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="taskType" value={taskType} />
      {disabled ? (
        <Button type="button" disabled title={disabledReason}>
          {label}
        </Button>
      ) : (
        <Submit variant={regenerate ? "secondary" : "primary"} pendingLabel="Starting…">
          {regenerate ? "Regenerate" : label}
        </Submit>
      )}
      <Feedback state={state} />
    </form>
  );
}
