"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  MessageSquareDot,
  PencilLine,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { DiffPreview } from "@/components/reviews/diff-preview";
import { useReviews } from "@/components/providers/review-provider";
import { useToast } from "@/components/providers/toast-provider";
import { formatDateTime } from "@/lib/format";
import type { Finding, Review, ReviewVersion } from "@/lib/types";

const DISMISS_REASONS = [
  "Not a policy issue",
  "Approved brand exception",
  "Incorrect evidence match",
  "Resolved outside this review",
  "Duplicate of another finding",
];

const REQUEST_TEMPLATES = [
  "Please add the approved study ID to this claim.",
  "Add #ad within the first 125 characters.",
  "Remove the absolute claim and use approved wording.",
];

const REJECT_TEMPLATES = [
  "Prohibited curative or guarantee claim.",
  "Missing required paid-partnership disclosure.",
  "Offer terms are incomplete and misleading.",
];

export function AcceptFixDialog({
  review,
  finding,
  open,
  onClose,
}: {
  review: Review;
  finding: Finding;
  open: boolean;
  onClose: () => void;
}) {
  const { updateFinding } = useReviews();
  const { toast } = useToast();
  const nextVersion =
    Math.max(...review.versions.map((version) => version.number), 0) + 1;

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={async () => {
        await updateFinding(review.id, finding.id, "accept");
        toast({
          title: "Suggested fix applied",
          description: `${finding.ruleCode} is resolved and version ${nextVersion} has been added to the audit trail.`,
          variant: "success",
        });
      }}
      title="Accept this suggested fix?"
      description="This is a human decision recorded against your name. The draft will be updated exactly as shown."
      confirmLabel="Accept and apply"
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      }
    >
      <div className="rounded-xl border border-line bg-ink-50/50 p-3">
        <p className="text-[11px] font-semibold text-ink-800">{finding.title}</p>
        <p className="mt-0.5 text-[10px] text-ink-400">
          {finding.ruleCode} · {finding.category} · {finding.severity}
        </p>
        <DiffPreview
          before={finding.evidence}
          after={finding.suggestedFix}
          className="mt-2.5"
        />
      </div>
      <InlineAlert variant="info">
        Applying the fix creates <strong>version {nextVersion}</strong> and keeps
        the original evidence attached to this finding for audit.
      </InlineAlert>
    </ConfirmDialog>
  );
}

export function EditFixDialog({
  review,
  finding,
  open,
  onClose,
}: {
  review: Review;
  finding: Finding;
  open: boolean;
  onClose: () => void;
}) {
  const { updateFinding } = useReviews();
  const { toast } = useToast();
  const [replacement, setReplacement] = useState(finding.suggestedFix);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextVersion =
    Math.max(...review.versions.map((version) => version.number), 0) + 1;

  async function applyEdit() {
    const trimmed = replacement.trim();
    if (!trimmed) {
      setError("Add a replacement before applying the edit.");
      return;
    }
    if (trimmed === finding.evidence) {
      setError("The replacement is identical to the highlighted text.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateFinding(review.id, finding.id, "edit", {
        replacement: trimmed,
      });
      toast({
        title: "Your edit was applied",
        description: `${finding.ruleCode} is resolved and version ${nextVersion} has been recorded.`,
        variant: "success",
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The edit could not be applied.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Edit the suggested replacement"
      description="Preserve the creator's intent while bringing the copy inside policy."
      size="lg"
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <PencilLine className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void applyEdit()} loading={busy} loadingLabel="Applying…">
            Apply custom edit
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <InlineAlert variant="danger" title="Could not apply the edit">
            {error}
          </InlineAlert>
        )}
        <div className="rounded-lg border border-line bg-ink-50/50 p-2.5 text-[11px] leading-relaxed text-ink-500">
          <span className="font-semibold text-ink-700">{finding.ruleCode}</span>{" "}
          · {finding.title}
        </div>
        <Field
          label="Your replacement"
          htmlFor="custom-replacement"
          hint={`${replacement.length} / 600 characters · adding this creates version ${nextVersion}`}
        >
          <Textarea
            id="custom-replacement"
            value={replacement}
            onChange={(event) => {
              setReplacement(event.target.value);
              setError(null);
            }}
            maxLength={600}
            className="min-h-[120px]"
            data-autofocus
          />
        </Field>
        <DiffPreview before={finding.evidence} after={replacement.trim()} />
        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-ink-400">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-mint-600" aria-hidden="true" />
          The original quote and your replacement are saved in the finding audit
          trail.
        </p>
      </div>
    </Modal>
  );
}

export function DismissFindingDialog({
  review,
  finding,
  open,
  onClose,
}: {
  review: Review;
  finding: Finding;
  open: boolean;
  onClose: () => void;
}) {
  const { updateFinding } = useReviews();
  const { toast } = useToast();
  const [reason, setReason] = useState(DISMISS_REASONS[0]);
  const [note, setNote] = useState("");

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={async () => {
        await updateFinding(review.id, finding.id, "dismiss", {
          reason: note.trim() ? `${reason} — ${note.trim()}` : reason,
        });
        toast({
          title: "Finding dismissed",
          description:
            "The policy flag is closed but remains visible in the review audit trail.",
          variant: "info",
        });
      }}
      title="Dismiss this finding?"
      description="Dismissing does not change the draft. It records that a human reviewed this flag and chose not to act on it."
      confirmLabel="Dismiss finding"
      variant="dark"
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
          <XCircle className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      }
    >
      <div className="rounded-lg border border-line bg-ink-50/50 p-2.5 text-[11px] text-ink-500">
        <span className="font-semibold text-ink-700">{finding.ruleCode}</span> ·{" "}
        {finding.title}
        <p className="mt-1 italic">“{finding.evidence}”</p>
      </div>
      <Field label="Reason" htmlFor="dismiss-reason">
        <Select
          id="dismiss-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          data-autofocus
        >
          {DISMISS_REASONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Reviewer note"
        htmlFor="dismiss-note"
        hint="Optional context for the audit trail."
      >
        <Textarea
          id="dismiss-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          className="min-h-[80px]"
          placeholder="e.g. Legal has confirmed this phrasing is a permitted sensory claim."
        />
      </Field>
    </ConfirmDialog>
  );
}

export function RequestChangesDialog({
  review,
  open,
  onClose,
}: {
  review: Review;
  open: boolean;
  onClose: () => void;
}) {
  const { requestChanges } = useReviews();
  const { toast } = useToast();
  const [note, setNote] = useState("");

  function handleClose() {
    setNote("");
    onClose();
  }

  const openCount = review.findings.filter(
    (finding) => finding.status === "open",
  ).length;

  return (
    <ConfirmDialog
      open={open}
      onClose={handleClose}
      onConfirm={async () => {
        if (note.trim().length < 8) {
          throw new Error(
            "Add a clear note for the creator (at least 8 characters).",
          );
        }
        await requestChanges(review.id, note.trim());
        toast({
          title: "Changes requested",
          description:
            "The review is back with the creator. Your note is saved in the discussion.",
          variant: "info",
        });
      }}
      title="Request changes from the creator"
      description={`${openCount} open ${openCount === 1 ? "finding remains" : "findings remain"}. The creator will see your note and the resolved evidence.`}
      confirmLabel="Request changes"
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <MessageSquareDot className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {REQUEST_TEMPLATES.map((template) => (
          <button
            key={template}
            type="button"
            onClick={() =>
              setNote((current) =>
                current ? `${current.trim()} ${template}` : template,
              )
            }
            className="rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-ink-500 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            + {template}
          </button>
        ))}
      </div>
      <Field
        label="Note for the creator"
        htmlFor="request-note"
        hint={`${note.length} / 2,000 characters · saved to the review discussion`}
      >
        <Textarea
          id="request-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={2000}
          className="min-h-[130px]"
          placeholder="Explain what needs to change and point to the evidence…"
          data-autofocus
        />
      </Field>
      <InlineAlert variant="warning">
        The status becomes <strong>Changes requested</strong>. Findings are not
        auto-resolved; the creator must revise and resubmit.
      </InlineAlert>
    </ConfirmDialog>
  );
}

export function RejectContentDialog({
  review,
  open,
  onClose,
}: {
  review: Review;
  open: boolean;
  onClose: () => void;
}) {
  const { rejectReview } = useReviews();
  const { toast } = useToast();
  const [reason, setReason] = useState("");

  function handleClose() {
    setReason("");
    onClose();
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={handleClose}
      onConfirm={async () => {
        if (reason.trim().length < 8) {
          throw new Error("Add a reason of at least 8 characters.");
        }
        await rejectReview(review.id, reason.trim());
        toast({
          title: "Content rejected",
          description:
            "The decision is recorded. Findings are locked for audit; do not publish this version.",
          variant: "error",
        });
      }}
      title="Reject this content?"
      description="A rejection is a final workflow decision. The content must not be published in its current form."
      confirmLabel="Reject content"
      variant="danger"
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
          <AlertCircle className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {REJECT_TEMPLATES.map((template) => (
          <button
            key={template}
            type="button"
            onClick={() => setReason(template)}
            className="rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-ink-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            {template}
          </button>
        ))}
      </div>
      <Field
        label="Reason for rejection"
        htmlFor="reject-reason"
        hint={`${reason.length} / 2,000 characters`}
      >
        <Textarea
          id="reject-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={2000}
          className="min-h-[120px]"
          placeholder="Explain which policy or risk makes this unpublishable…"
          data-autofocus
        />
      </Field>
      <InlineAlert variant="danger" title="This decision is recorded">
        Your name and the reason are added to the decision log. The findings
        cannot be edited afterwards.
      </InlineAlert>
    </ConfirmDialog>
  );
}

export function VersionPreviewDialog({
  version,
  open,
  onClose,
}: {
  version: ReviewVersion | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!version) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Version ${version.number} snapshot`}
      description={`${version.author} · ${formatDateTime(version.createdAt)}`}
      size="lg"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
          <span className="font-semibold text-ink-700">{version.note}</span>
          <span className="text-ink-300" aria-hidden="true">·</span>
          <span>{version.openFindings} open findings at this version</span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-line bg-ink-50/40 p-4">
          <p className="whitespace-pre-wrap text-[13px] leading-[1.85] text-ink-700">
            {version.content}
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-[10px] text-ink-400">
          <CheckCircle2 className="h-3 w-3 text-mint-600" aria-hidden="true" />
          This snapshot is immutable and retained for the review audit trail.
        </p>
      </div>
    </Modal>
  );
}
