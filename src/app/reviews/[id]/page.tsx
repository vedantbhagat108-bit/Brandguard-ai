"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  AlertOctagon,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCheck,
  Clock,
  FilePlus2,
  FileQuestion,
  FileText,
  History,
  MessageSquare,
  MessageSquareDot,
  ShieldCheck,
  Sparkles,
  Stamp,
  XCircle,
} from "lucide-react";
import { useReviews } from "@/components/providers/review-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge, DemoBadge, StatusBadge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ScoreRing } from "@/components/ui/score-ring";
import { DetailSkeleton } from "@/components/ui/skeletons";
import {
  HighlightedContent,
  HighlightLegend,
} from "@/components/reviews/highlighted-content";
import { FindingCard } from "@/components/reviews/finding-card";
import { KnowledgeGapCard } from "@/components/reviews/knowledge-gap-card";
import { DiscussionCard } from "@/components/reviews/discussion-card";
import { VersionHistoryCard } from "@/components/reviews/version-history-card";
import {
  AcceptFixDialog,
  DismissFindingDialog,
  EditFixDialog,
  RejectContentDialog,
  RequestChangesDialog,
} from "@/components/reviews/review-dialogs";
import {
  formatDateTime,
  formatRelative,
  formatTime,
  isDueSoon,
  isOverdue,
} from "@/lib/format";
import {
  countSeverity,
  scoreTone,
  sortFindingsBySeverity,
} from "@/lib/review-config";
import { cn, pluralize } from "@/lib/utils";
import type { ActivityType } from "@/lib/types";

const ACTIVITY_ICONS: Record<ActivityType, typeof Activity> = {
  submitted: FilePlus2,
  analysis: Sparkles,
  finding: CheckCheck,
  comment: MessageSquare,
  version: History,
  decision: Stamp,
};

const ACTIVITY_TONES: Record<ActivityType, string> = {
  submitted: "bg-brand-50 text-brand-600",
  analysis: "bg-violet-50 text-violet-600",
  finding: "bg-emerald-50 text-emerald-600",
  comment: "bg-sky-50 text-sky-600",
  version: "bg-amber-50 text-amber-700",
  decision: "bg-ink-900 text-white",
};

type FindingFilter = "all" | "open" | "resolved";

export default function ReviewDetailPage() {
  const params = useParams<{ id: string }>();
  const reviewId = Array.isArray(params.id) ? params.id[0] : params.id;
  const {
    getReview,
    loading,
    error,
    refresh,
    simulateCreatorRevision,
  } = useReviews();
  const { toast } = useToast();

  const review = getReview(reviewId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [findingFilter, setFindingFilter] = useState<FindingFilter>("all");
  const [acceptId, setAcceptId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);

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
          title="The review could not load"
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
      <div className="space-y-5">
        <Link
          href="/reviews"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-500 transition hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to review queue
        </Link>
        <EmptyState
          icon={FileQuestion}
          title="Review not found"
          description="This review may have been removed or belongs to another demo workspace. The seeded reviews are stored locally in this browser."
          action={
            <Link href="/reviews" className={buttonStyles({ size: "sm" })}>
              Browse the review queue
            </Link>
          }
        />
      </div>
    );
  }

  const openFindings = review.findings.filter(
    (finding) => finding.status === "open",
  );
  const resolvedFindings = review.findings.filter(
    (finding) => finding.status !== "open",
  );
  const severity = countSeverity(review.findings);
  const criticalOpen = openFindings.filter(
    (finding) => finding.severity === "critical",
  ).length;
  const highOpen = openFindings.filter(
    (finding) => finding.severity === "high",
  ).length;
  const locked = review.status === "approved" || review.status === "rejected";
  const latestVersion = review.versions[review.versions.length - 1];
  const tone = scoreTone(review.score);
  const wordCount = review.content.trim()
    ? review.content.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const dueOverdue = isOverdue(review.dueAt);
  const dueSoon = !dueOverdue && isDueSoon(review.dueAt);

  const sortedFindings = sortFindingsBySeverity(review.findings);
  const filteredFindings = sortedFindings.filter((finding) => {
    if (findingFilter === "open") return finding.status === "open";
    if (findingFilter === "resolved") return finding.status !== "open";
    return true;
  });

  const acceptFinding = acceptId
    ? (review.findings.find((finding) => finding.id === acceptId) ?? null)
    : null;
  const editFinding = editId
    ? (review.findings.find((finding) => finding.id === editId) ?? null)
    : null;
  const dismissFinding = dismissId
    ? (review.findings.find((finding) => finding.id === dismissId) ?? null)
    : null;

  function focusAnnotation(id: string) {
    setSelectedId(id);
    window.setTimeout(() => {
      const target =
        document.getElementById(`finding-${id}`) ??
        document.getElementById(`gap-${id}`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 40);
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <Link
        href="/reviews"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-500 transition hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to review queue
      </Link>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={review.status} />
            <Badge className="border-line bg-white text-ink-500 normal-case tracking-normal">
              {review.channel}
            </Badge>
            {review.isPaidPartnership && (
              <Badge className="border-amber-200 bg-amber-50 text-amber-800 normal-case tracking-normal">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Paid partnership
              </Badge>
            )}
            <Badge className="border-line bg-white text-ink-500 normal-case tracking-normal">
              v{latestVersion?.number ?? 1}
            </Badge>
            {review.dueAt && (
              <Badge
                className={cn(
                  "normal-case tracking-normal",
                  dueOverdue
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : dueSoon
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-line bg-ink-50 text-ink-500",
                )}
              >
                <Clock className="h-3 w-3" aria-hidden="true" />
                {dueOverdue
                  ? "Overdue"
                  : dueSoon
                    ? `Due ${formatTime(review.dueAt)}`
                    : `Due ${formatDateTime(review.dueAt)}`}
              </Badge>
            )}
          </div>

          <h1 className="mt-2.5 max-w-3xl text-[24px] font-semibold leading-tight tracking-[-0.025em] text-ink-950 sm:text-[28px]">
            {review.title}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-400">
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={review.submittedBy} size="xs" />
              <span className="font-medium text-ink-600">
                {review.submittedBy}
              </span>
              <span>· {review.submittedRole}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>Assigned to {review.assignedTo}</span>
            <span aria-hidden="true">·</span>
            <span>Updated {formatRelative(review.updatedAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!locked ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setRequestOpen(true)}
              >
                <MessageSquareDot className="h-4 w-4" aria-hidden="true" />
                Request changes
              </Button>
              <Button
                variant="danger-ghost"
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Reject
              </Button>
              <Link
                href={`/reviews/${review.id}/approve`}
                className={buttonStyles({ variant: "primary" })}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Review &amp; approve
              </Link>
            </>
          ) : (
            <Link
              href={`/reviews/${review.id}/approve`}
              className={buttonStyles({ variant: "secondary" })}
            >
              <Stamp className="h-4 w-4" aria-hidden="true" />
              View decision record
            </Link>
          )}
        </div>
      </div>

      {review.decision && (
        <InlineAlert
          variant={review.decision.action === "approved" ? "success" : "danger"}
          title={
            review.decision.action === "approved"
              ? "Approved for publication"
              : "Rejected — do not publish"
          }
          action={
            <Link
              href={`/reviews/${review.id}/approve`}
              className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-ink-700 shadow-sm ring-1 ring-inset ring-black/5 transition hover:bg-white"
            >
              Decision record
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          }
        >
          <p>{review.decision.note}</p>
          <p className="mt-1 text-[11px] opacity-70">
            {review.decision.by} · {formatDateTime(review.decision.at)}
          </p>
        </InlineAlert>
      )}

      {review.status === "changes_requested" && (
        <InlineAlert
          variant="warning"
          title="Waiting on the creator"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setRevisionOpen(true)}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Simulate creator revision
            </Button>
          }
        >
          The review is back with the creator. The demo helper applies the
          remaining suggested fixes and resubmits a new version so you can
          continue the workflow.
        </InlineAlert>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex items-center gap-4">
            <ScoreRing
              score={review.score}
              size={84}
              strokeWidth={5}
              label="Advisory compliance score"
            />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
                Advisory score
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge className={tone.badge}>{tone.label}</Badge>
                <span className="text-[10px] text-ink-400">
                  Not a legal verdict
                </span>
              </div>
              <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-ink-600">
                {review.summary}
              </p>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 sm:ml-auto sm:grid-cols-4 xl:grid-cols-2">
            {[
              {
                label: "Open findings",
                value: openFindings.length,
                note:
                  criticalOpen > 0
                    ? `${criticalOpen} critical`
                    : highOpen > 0
                      ? `${highOpen} high`
                      : "No blockers",
                tone:
                  criticalOpen > 0
                    ? "text-rose-700"
                    : highOpen > 0
                      ? "text-orange-700"
                      : "text-emerald-700",
              },
              {
                label: "Knowledge gaps",
                value: review.knowledgeGaps.length,
                note: "Need human input",
                tone: "text-violet-700",
              },
              {
                label: "Resolved",
                value: resolvedFindings.length,
                note: `of ${review.findings.length} findings`,
                tone: "text-ink-700",
              },
              {
                label: "Versions",
                value: review.versions.length,
                note: `Current v${latestVersion?.number ?? 1}`,
                tone: "text-brand-700",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="min-w-[112px] rounded-xl border border-line bg-ink-50/45 px-3 py-2.5"
              >
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-400">
                  {stat.label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-xl font-semibold tabular-nums",
                    stat.tone,
                  )}
                >
                  {stat.value}
                </p>
                <p className="text-[9px] leading-tight text-ink-400">
                  {stat.note}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <Card className="overflow-hidden">
            <CardHeader
              title="Submitted content"
              description="Select a highlight to inspect its rule, evidence and cited source."
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </span>
              }
              action={
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge className="border-line bg-white text-ink-500 normal-case tracking-normal">
                    {pluralize(wordCount, "word")}
                  </Badge>
                  <Badge className="border-line bg-white text-ink-500 normal-case tracking-normal">
                    v{latestVersion?.number ?? 1}
                  </Badge>
                </div>
              }
            />
            <div className="border-b border-line bg-ink-50/35 px-5 py-2.5 sm:px-6">
              <HighlightLegend
                findings={review.findings}
                gapCount={review.knowledgeGaps.length}
              />
            </div>
            <div className="px-5 py-5 sm:px-6 sm:py-6">
              <HighlightedContent
                content={review.content}
                findings={review.findings}
                gaps={review.knowledgeGaps}
                selectedId={selectedId}
                onSelect={focusAnnotation}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line bg-ink-50/40 px-5 py-3 text-[10px] text-ink-400 sm:px-6">
              <span>{review.content.length.toLocaleString()} characters</span>
              <span aria-hidden="true">·</span>
              <span>{pluralize(wordCount, "word")}</span>
              {review.sourceFileName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3 w-3" aria-hidden="true" />
                    {review.sourceFileName}
                  </span>
                </>
              )}
              <span className="sm:ml-auto">
                Original evidence stays attached to each finding.
              </span>
            </div>
          </Card>

          {review.knowledgeGaps.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader
                title="Knowledge gaps"
                description="These are not violations. They are places where the approved library has no answer, so a human must decide."
                icon={
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                    <FileQuestion className="h-4 w-4" aria-hidden="true" />
                  </span>
                }
                action={
                  <Badge className="border-violet-200 bg-violet-50 text-violet-700 normal-case tracking-normal">
                    {review.knowledgeGaps.length} to verify
                  </Badge>
                }
              />
              <div className="space-y-3 p-4 sm:p-5">
                {review.knowledgeGaps.map((gap) => (
                  <KnowledgeGapCard
                    key={gap.id}
                    gap={gap}
                    selected={selectedId === gap.id}
                    onSelect={() => setSelectedId(gap.id)}
                    onLocate={() => focusAnnotation(gap.id)}
                  />
                ))}
              </div>
            </Card>
          )}

          <DiscussionCard review={review} locked={locked} />
          <VersionHistoryCard review={review} />
        </div>

        <aside className="space-y-4 xl:col-span-4">
          <Card className="overflow-hidden">
            <CardHeader
              title="Findings"
              description="Advisory issues with cited evidence and a human decision on each."
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  <AlertOctagon className="h-4 w-4" aria-hidden="true" />
                </span>
              }
              action={
                <Badge className="border-line bg-white text-ink-500 normal-case tracking-normal">
                  {openFindings.length} open
                </Badge>
              }
            />

            <div
              className="flex flex-wrap gap-1 border-b border-line px-3.5 py-2.5"
              role="tablist"
              aria-label="Filter findings"
            >
              {(
                [
                  ["all", "All", review.findings.length],
                  ["open", "Open", openFindings.length],
                  ["resolved", "Resolved", resolvedFindings.length],
                ] as const
              ).map(([value, label, count]) => {
                const active = findingFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFindingFilter(value)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                      active
                        ? "bg-ink-900 text-white shadow-sm"
                        : "text-ink-500 hover:bg-ink-100 hover:text-ink-800",
                    )}
                  >
                    {label}
                    <span
                      className={cn(
                        "rounded px-1 py-0.5 text-[9px] tabular-nums",
                        active
                          ? "bg-white/15 text-white/80"
                          : "bg-ink-100 text-ink-400",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
              {severity.critical > 0 && (
                <Badge className="ml-auto border-rose-200 bg-rose-50 text-rose-700 normal-case tracking-normal">
                  {severity.critical} critical
                </Badge>
              )}
            </div>

            <div className="space-y-3 bg-ink-50/35 p-3.5 sm:p-4">
              {filteredFindings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line bg-white px-4 py-8 text-center">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <CheckCheck className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-[12px] font-semibold text-ink-800">
                    {findingFilter === "open"
                      ? "Nothing open"
                      : findingFilter === "resolved"
                        ? "No resolved findings yet"
                        : "No policy issues detected"}
                  </p>
                  <p className="mx-auto mt-1 max-w-[240px] text-[10px] leading-relaxed text-ink-400">
                    {findingFilter === "open"
                      ? "Every finding on this version has been reviewed or dismissed."
                      : findingFilter === "resolved"
                        ? "Accepted, edited and dismissed findings will appear here."
                        : "A human reviewer should still confirm context, visuals and channel requirements."}
                  </p>
                </div>
              ) : (
                filteredFindings.map((finding) => (
                  <FindingCard
                    key={finding.id}
                    finding={finding}
                    selected={selectedId === finding.id}
                    locked={locked}
                    onSelect={() => setSelectedId(finding.id)}
                    onAccept={() => setAcceptId(finding.id)}
                    onEdit={() => setEditId(finding.id)}
                    onDismiss={() => setDismissId(finding.id)}
                  />
                ))
              )}
            </div>

            <div className="flex items-start gap-2 border-t border-line bg-white px-4 py-3 text-[10px] leading-relaxed text-ink-400">
              <ShieldCheck
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint-600"
                aria-hidden="true"
              />
              Findings are advisory. Accepting a fix creates a new version; all
              human decisions are recorded against your name.
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Audit trail"
              description="Everything recorded for this review."
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
                  <History className="h-4 w-4" aria-hidden="true" />
                </span>
              }
              action={<DemoBadge />}
            />
            <ul className="divide-y divide-line">
              {review.activity.slice(0, 8).map((event) => {
                const Icon = ACTIVITY_ICONS[event.type] ?? Activity;
                return (
                  <li key={event.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                        ACTIVITY_TONES[event.type] ?? "bg-ink-100 text-ink-500",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] leading-snug text-ink-700">
                        {event.message}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        {event.actor} · {formatRelative(event.at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center gap-1.5 border-t border-line bg-ink-50/40 px-4 py-2.5 text-[10px] text-ink-400 sm:px-5">
              <CalendarClock className="h-3 w-3" aria-hidden="true" />
              Submitted {formatRelative(review.submittedAt)}
              <span aria-hidden="true">·</span>
              {review.findings.length} total findings
            </div>
          </Card>
        </aside>
      </div>

      {acceptFinding && (
        <AcceptFixDialog
          key={acceptFinding.id}
          review={review}
          finding={acceptFinding}
          open
          onClose={() => setAcceptId(null)}
        />
      )}
      {editFinding && (
        <EditFixDialog
          key={editFinding.id}
          review={review}
          finding={editFinding}
          open
          onClose={() => setEditId(null)}
        />
      )}
      {dismissFinding && (
        <DismissFindingDialog
          key={dismissFinding.id}
          review={review}
          finding={dismissFinding}
          open
          onClose={() => setDismissId(null)}
        />
      )}
      <RequestChangesDialog
        review={review}
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
      />
      <RejectContentDialog
        review={review}
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
      />

      <ConfirmDialog
        open={revisionOpen}
        onClose={() => setRevisionOpen(false)}
        onConfirm={async () => {
          const updated = await simulateCreatorRevision(review.id);
          const remaining = updated.findings.filter(
            (finding) => finding.status === "open",
          ).length;
          toast({
            title: "Creator revision simulated",
            description: `A new version was added with all suggested fixes applied. ${remaining} findings remain open.`,
            variant: "success",
          });
        }}
        title="Simulate a creator revision?"
        description="Demo helper: this applies every remaining suggested fix on behalf of the creator and adds a new version. No creator portal is connected."
        confirmLabel="Apply fixes and resubmit"
        variant="dark"
        icon={
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        }
      >
        <div className="space-y-2 rounded-xl border border-line bg-ink-50/50 p-3.5 text-[11px] leading-relaxed text-ink-500">
          <p>
            <span className="font-semibold text-ink-800">
              {openFindings.length} open{" "}
              {openFindings.length === 1 ? "finding" : "findings"}
            </span>{" "}
            will be marked as resolved by the creator.
          </p>
          <p>
            The original evidence and your existing comments stay in the audit
            trail.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
