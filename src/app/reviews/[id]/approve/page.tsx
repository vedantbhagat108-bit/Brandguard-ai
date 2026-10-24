"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertOctagon,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileQuestion,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  XCircle,
} from "lucide-react";
import { useReviews } from "@/components/providers/review-provider";
import { useToast } from "@/components/providers/toast-provider";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, DemoBadge, StatusBadge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ScoreRing } from "@/components/ui/score-ring";
import { DetailSkeleton } from "@/components/ui/skeletons";
import { RejectContentDialog } from "@/components/reviews/review-dialogs";
import { formatDateTime, formatRelative } from "@/lib/format";
import { countSeverity, statusIsOpen } from "@/lib/review-config";
import { cn, pluralize } from "@/lib/utils";

const NOTE_TEMPLATES = [
  "All critical findings resolved. Evidence checked against the approved claims library.",
  "Disclosure position and offer terms verified for this channel.",
  "High-severity findings reviewed and accepted with the noted context.",
];

export default function ApprovalPage() {
  const params = useParams<{ id: string }>();
  const reviewId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { getReview, loading, error, refresh, approveReview } = useReviews();
  const { toast } = useToast();

  const review = getReview(reviewId);
  const [evidenceReviewed, setEvidenceReviewed] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [disclosureConfirmed, setDisclosureConfirmed] = useState(false);
  const [gapsVerified, setGapsVerified] = useState(false);
  const [attestation, setAttestation] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

  if (loading) return <DetailSkeleton />;

  if (error) {
    return (
      <div className="space-y-5">
        <Link
          href="/reviews"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-500 transition hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to review queue
        </Link>
        <InlineAlert
          variant="danger"
          title="The approval screen could not load"
          action={
            <Button size="sm" variant="secondary" onClick={() => void refresh()}>
              Try again
            </Button>
          }
        >
          {error}
        </InlineAlert>
      </div>
    );
  }

  if (!review) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Review not found"
        description="This review is no longer available in the local demo workspace."
        action={
          <Link href="/reviews" className={buttonStyles({ size: "sm" })}>
            Browse the review queue
          </Link>
        }
      />
    );
  }

  const isFinalDecided =
    (review.status === "approved" || review.status === "rejected") &&
    Boolean(review.decision);

  if (isFinalDecided && review.decision) {
    const approved = review.decision.action === "approved";
    return (
      <div className="space-y-5">
        <Link
          href={`/reviews/${review.id}`}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-500 transition hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to review
        </Link>

        <PageHeader
          eyebrow={
            <>
              <DemoBadge />
              <span className="text-[11px] font-medium text-ink-400">
                Final decision record
              </span>
            </>
          }
          title={approved ? "Approved for publication" : "Rejected — do not publish"}
          description={`${review.title} · decision recorded by ${review.decision.by}.`}
          actions={
            <Link
              href={`/reviews/${review.id}`}
              className={buttonStyles({ variant: "secondary" })}
            >
              View review
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />

        <InlineAlert
          variant={approved ? "success" : "danger"}
          title={
            approved
              ? "A named reviewer cleared this version"
              : "This content must not be published"
          }
          icon={
            approved ? (
              <CheckCircle2 className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-[18px] w-[18px]" aria-hidden="true" />
            )
          }
        >
          <p>{review.decision.note}</p>
          <p className="mt-1 text-[11px] opacity-70">
            {formatDateTime(review.decision.at)} · {formatRelative(review.decision.at)}
          </p>
        </InlineAlert>

        <div className="grid gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-8">
            <Card className="overflow-hidden">
              <CardHeader
                title="Decision details"
                description="This record is immutable and retained in the review audit trail."
                icon={
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-white">
                    <Stamp className="h-4 w-4" aria-hidden="true" />
                  </span>
                }
              />
              <CardBody className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Decision", approved ? "Approved" : "Rejected"],
                    ["Reviewer", review.decision.by],
                    ["Timestamp", formatDateTime(review.decision.at)],
                    [
                      "Version",
                      `v${review.versions[review.versions.length - 1]?.number ?? 1}`,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-line bg-ink-50/40 px-3.5 py-3"
                    >
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">
                        {label}
                      </p>
                      <p className="mt-1 text-[13px] font-semibold text-ink-800">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-line bg-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
                    Recorded note
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-600">
                    {review.decision.note}
                  </p>
                </div>
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-400">
                  <LockKeyhole
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint-600"
                    aria-hidden="true"
                  />
                  Findings and versions are locked after a final decision. Follow-up
                  notes can still be added to the discussion.
                </p>
              </CardBody>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader
                title="Finding snapshot at decision"
                description="What the reviewer saw when the decision was recorded."
              />
              <ul className="divide-y divide-line">
                {review.findings.map((finding) => (
                  <li
                    key={finding.id}
                    className="flex flex-wrap items-center gap-2 px-5 py-3.5 sm:px-6"
                  >
                    <Badge className="border-line bg-ink-50 font-mono text-[10px] tracking-normal text-ink-500">
                      {finding.ruleCode}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-700">
                      {finding.title}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                        finding.status === "open"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-emerald-50 text-emerald-700",
                      )}
                    >
                      {finding.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <aside className="space-y-4 xl:col-span-4">
            <Card className="overflow-hidden">
              <CardBody className="flex flex-col items-center text-center">
                <ScoreRing
                  score={review.score}
                  size={112}
                  strokeWidth={5}
                  label="Final advisory score"
                />
                <StatusBadge status={review.status} className="mt-4" />
                <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
                  {review.summary}
                </p>
              </CardBody>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="Next steps" />
              <CardBody className="space-y-3 text-[11px] leading-relaxed text-ink-500">
                <p className="flex gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[9px] font-bold text-ink-600">
                    1
                  </span>
                  {approved
                    ? "Share the approved version with the publishing team."
                    : "Brief the creator on the recorded reason before any resubmission."}
                </p>
                <p className="flex gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[9px] font-bold text-ink-600">
                    2
                  </span>
                  Keep the decision record with the campaign file for audit.
                </p>
                <Link
                  href="/reviews"
                  className="inline-flex items-center gap-1 pt-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                >
                  Return to the review queue
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </CardBody>
            </Card>
          </aside>
        </div>
      </div>
    );
  }

  const severity = countSeverity(review.findings);
  const openFindings = review.findings.filter(
    (finding) => finding.status === "open",
  );
  const criticalOpen = openFindings.filter(
    (finding) => finding.severity === "critical",
  ).length;
  const highOpen = openFindings.filter(
    (finding) => finding.severity === "high",
  ).length;
  const hasHigh = highOpen > 0;
  const hasGaps = review.knowledgeGaps.length > 0;
  const requiresDisclosure = review.isPaidPartnership;
  const checklistTotal =
    2 +
    (hasHigh ? 1 : 0) +
    (requiresDisclosure ? 1 : 0) +
    (hasGaps ? 1 : 0);
  const checklistDone =
    Number(evidenceReviewed) +
    Number(attestation) +
    Number(!hasHigh || riskAcknowledged) +
    Number(!requiresDisclosure || disclosureConfirmed) +
    Number(!hasGaps || gapsVerified);
  const noteIsValid = note.trim().length >= 10;
  const canApprove =
    criticalOpen === 0 &&
    evidenceReviewed &&
    attestation &&
    (!hasHigh || riskAcknowledged) &&
    (!requiresDisclosure || disclosureConfirmed) &&
    (!hasGaps || gapsVerified) &&
    noteIsValid &&
    statusIsOpen(review.status);

  const missing: string[] = [];
  if (criticalOpen > 0) {
    missing.push(
      `Resolve ${pluralize(criticalOpen, "critical finding")} before approval.`,
    );
  }
  if (!evidenceReviewed) missing.push("Confirm you reviewed the evidence.");
  if (hasHigh && !riskAcknowledged) {
    missing.push("Acknowledge the high-severity findings.");
  }
  if (requiresDisclosure && !disclosureConfirmed) {
    missing.push("Confirm the paid-partnership disclosure.");
  }
  if (hasGaps && !gapsVerified) {
    missing.push(
      `Verify or accept responsibility for the ${pluralize(review.knowledgeGaps.length, "unresolved knowledge gap")}.`,
    );
  }
  if (!attestation) missing.push("Attest to the final decision.");
  if (!noteIsValid) missing.push("Add an approval note of at least 10 characters.");

  async function handleApprove() {
    if (!review) return;
    if (!canApprove) {
      setApproveError("Complete the checklist and approval note first.");
      return;
    }
    setBusy(true);
    setApproveError(null);
    try {
      await approveReview(review.id, note.trim());
      toast({
        title: "Content approved",
        description:
          "Your checklist, note and decision are recorded in the review audit trail.",
        variant: "success",
      });
      router.push(`/reviews/${review.id}`);
    } catch (err) {
      setApproveError(
        err instanceof Error
          ? err.message
          : "The approval could not be recorded. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/reviews/${review.id}`}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-500 transition hover:text-ink-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to review
      </Link>

      <PageHeader
        eyebrow={
          <>
            <DemoBadge />
            <span className="text-[11px] font-medium text-ink-400">
              Step 2 of 2 · Final human decision
            </span>
          </>
        }
        title="Approval review"
        description="Confirm the evidence, acknowledge any remaining risk and record a named decision. Approval does not publish the content."
        actions={
          <Link
            href={`/reviews/${review.id}`}
            className={buttonStyles({ variant: "secondary" })}
          >
            Back to review
          </Link>
        }
      />

      {criticalOpen > 0 && (
        <InlineAlert
          variant="danger"
          title={`${pluralize(criticalOpen, "critical finding")} still open`}
          action={
            <Link
              href={`/reviews/${review.id}`}
              className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 shadow-sm ring-1 ring-inset ring-rose-200 transition hover:bg-rose-50"
            >
              Resolve findings
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          }
        >
          Approval is blocked until every critical finding is accepted, edited or
          dismissed with a recorded reason.
        </InlineAlert>
      )}

      {criticalOpen === 0 && hasHigh && (
        <InlineAlert variant="warning" title="High-severity findings remain">
          There are {pluralize(highOpen, "high-severity finding")} open. You may
          approve, but the checklist requires an explicit risk acknowledgement.
        </InlineAlert>
      )}

      {hasGaps && (
        <InlineAlert
          variant="info"
          title={`${pluralize(review.knowledgeGaps.length, "unresolved knowledge gap")} requires human verification`}
        >
          Even when the advisory score reaches 100/100, automated checks cannot
          verify claims missing from the approved policy library. Confirm below
          that you have independently verified or accepted responsibility for{" "}
          {review.knowledgeGaps.length === 1 ? "this gap" : "these gaps"}.
        </InlineAlert>
      )}

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <Card className="overflow-hidden">
            <CardHeader
              title="Approval checklist"
              description="Each item is a human confirmation, not an automated check."
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                </span>
              }
              action={
                <Badge
                  className={cn(
                    "normal-case tracking-normal",
                    checklistDone === checklistTotal
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-line bg-ink-50 text-ink-500",
                  )}
                >
                  {checklistDone} of {checklistTotal} complete
                </Badge>
              }
            />
            <CardBody className="space-y-3">
              <Checkbox
                id="evidence-reviewed"
                checked={evidenceReviewed}
                onChange={setEvidenceReviewed}
                label={
                  <span>
                    I reviewed every open finding and its cited source
                    <span className="ml-1 text-rose-500" aria-hidden="true">
                      *
                    </span>
                  </span>
                }
                description={`${openFindings.length} open ${openFindings.length === 1 ? "finding" : "findings"} · ${review.knowledgeGaps.length} knowledge ${review.knowledgeGaps.length === 1 ? "gap" : "gaps"} to consider.`}
              />

              {hasHigh && (
                <Checkbox
                  id="risk-acknowledged"
                  checked={riskAcknowledged}
                  onChange={setRiskAcknowledged}
                  label={
                    <span>
                      I acknowledge the high-severity findings
                      <span className="ml-1 text-rose-500" aria-hidden="true">
                        *
                      </span>
                    </span>
                  }
                  description={`${pluralize(highOpen, "high-severity finding")} remain open. Your approval accepts this documented risk.`}
                />
              )}

              {requiresDisclosure && (
                <Checkbox
                  id="disclosure-confirmed"
                  checked={disclosureConfirmed}
                  onChange={setDisclosureConfirmed}
                  label={
                    <span>
                      I confirmed the paid-partnership disclosure
                      <span className="ml-1 text-rose-500" aria-hidden="true">
                        *
                      </span>
                    </span>
                  }
                  description="The copy is marked as a paid partnership. Verify that #ad is clear and appears within the first 125 characters on Instagram."
                />
              )}

              {hasGaps && (
                <Checkbox
                  id="gaps-verified"
                  checked={gapsVerified}
                  onChange={setGapsVerified}
                  label={
                    <span>
                      I verified or accepted responsibility for the{" "}
                      {pluralize(review.knowledgeGaps.length, "knowledge gap")}
                      <span className="ml-1 text-rose-500" aria-hidden="true">
                        *
                      </span>
                    </span>
                  }
                  description={`${review.knowledgeGaps.map((g) => g.topic).join("; ")} — verified outside the automated rule library.`}
                />
              )}

              <Checkbox
                id="final-attestation"
                checked={attestation}
                onChange={setAttestation}
                label={
                  <span>
                    I attest that this decision is mine and reflects the current
                    version
                    <span className="ml-1 text-rose-500" aria-hidden="true">
                      *
                    </span>
                  </span>
                }
                description={`The approval records your name against v${review.versions[review.versions.length - 1]?.number ?? 1} and its finding snapshot.`}
              />
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Approval note"
              description="Explain the evidence you checked and any residual risk you accepted."
              action={
                <span className="text-[10px] tabular-nums text-ink-400">
                  {note.length} / 2,000
                </span>
              }
            />
            <CardBody className="space-y-4">
              {approveError && (
                <InlineAlert variant="danger" title="Approval could not be recorded">
                  {approveError}
                </InlineAlert>
              )}

              <div className="flex flex-wrap gap-1.5">
                {NOTE_TEMPLATES.map((template) => (
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
                label="Reviewer note"
                htmlFor="approval-note"
                required
                hint="At least 10 characters. Saved with the decision for audit."
              >
                <Textarea
                  id="approval-note"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    if (approveError) setApproveError(null);
                  }}
                  maxLength={2000}
                  placeholder="e.g. All critical findings resolved. Evidence checked against Claims Policy v2.4 and Study AUR-2025-014. #ad is present in the first line."
                  className="min-h-[120px]"
                />
              </Field>

              {missing.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                  <p className="text-[11px] font-semibold text-amber-900">
                    Before you can approve
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[10px] leading-relaxed text-amber-900/80">
                    {missing.map((item) => (
                      <li key={item} className="flex gap-1.5">
                        <span aria-hidden="true">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <InlineAlert variant="success" title="Ready to record the decision">
                  The checklist is complete. Approving records your name and
                  locks the findings for audit.
                </InlineAlert>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-1.5 text-[10px] leading-relaxed text-ink-400">
                  <LockKeyhole className="h-3 w-3 shrink-0" aria-hidden="true" />
                  Demo only · the decision is stored in this browser.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="danger-ghost"
                    onClick={() => setRejectOpen(true)}
                    disabled={busy}
                  >
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    Reject instead
                  </Button>
                  <Button
                    onClick={() => void handleApprove()}
                    loading={busy}
                    loadingLabel="Recording…"
                    disabled={!canApprove}
                    className="min-w-[180px]"
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Approve content
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-4 xl:col-span-4">
          <Card className="overflow-hidden">
            <CardHeader
              title="Decision summary"
              description="The version that will be recorded."
            />
            <CardBody className="space-y-4">
              <div className="flex items-center gap-4">
                <ScoreRing
                  score={review.score}
                  size={92}
                  strokeWidth={5}
                  label="Advisory compliance score"
                />
                <div>
                  <StatusBadge status={review.status} />
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                    {review.channel} · v
                    {review.versions[review.versions.length - 1]?.number ?? 1}
                  </p>
                  <p className="mt-1 text-[10px] text-ink-400">
                    Submitted {formatRelative(review.submittedAt)}
                  </p>
                </div>
              </div>

              <dl className="space-y-2 border-t border-line pt-3">
                {[
                  ["Open findings", openFindings.length],
                  ["Critical", severity.critical],
                  ["High", severity.high],
                  ["Knowledge gaps", review.knowledgeGaps.length],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <dt className="text-ink-500">{label}</dt>
                    <dd className="font-semibold tabular-nums text-ink-800">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="What gets recorded"
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
                  <Stamp className="h-4 w-4" aria-hidden="true" />
                </span>
              }
            />
            <CardBody className="space-y-3">
              {[
                {
                  title: "Your name and role",
                  text: "A named human decision, not an automated verdict.",
                },
                {
                  title: "Checklist and note",
                  text: "The confirmations above and your written rationale.",
                },
                {
                  title: "Version snapshot",
                  text: "The exact copy and finding states at decision time.",
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-2.5">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-mint-600"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-[11px] font-semibold text-ink-800">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-ink-400">
                      {item.text}
                    </p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <div className="flex items-start gap-2 rounded-2xl border border-line bg-white p-4 text-[10px] leading-relaxed text-ink-400 shadow-card">
            <AlertOctagon
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
              aria-hidden="true"
            />
            <p>
              BrandLens findings are advisory. Approval confirms a human review
              of this demo copy; it is not legal advice or a regulatory clearance.
            </p>
          </div>
        </aside>
      </div>

      <RejectContentDialog
        review={review}
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
      />
    </div>
  );
}
