"use client";

import Link from "next/link";
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  CheckCheck,
  ChevronRight,
  Clock,
  Eye,
  FilePlus2,
  Gauge,
  History,
  Inbox,
  MessageSquare,
  MessageSquareDot,
  Plus,
  Sparkles,
  Stamp,
  TrendingUp,
} from "lucide-react";
import { useReviews } from "@/components/providers/review-provider";
import { PageHeader } from "@/components/layout/page-header";
import { DemoGuideTrigger } from "@/components/layout/demo-guide";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, DemoBadge, StatusBadge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ui/score-ring";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { OverviewSkeleton } from "@/components/ui/skeletons";
import { Button, buttonStyles } from "@/components/ui/button";
import { formatRelative, formatTime, isOverdue } from "@/lib/format";
import {
  countSeverity,
  DEMO_USER,
  statusIsOpen,
} from "@/lib/review-config";
import { cn, pluralize } from "@/lib/utils";
import type { Review } from "@/lib/types";

function SummaryCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
  chip,
}: {
  icon: typeof Eye;
  label: string;
  value: string | number;
  note: string;
  tone: "brand" | "amber" | "rose" | "mint";
  chip: string;
}) {
  const tones = {
    brand: { tile: "bg-brand-50 text-brand-600", chip: "bg-brand-50 text-brand-700" },
    amber: { tile: "bg-amber-50 text-amber-600", chip: "bg-amber-50 text-amber-800" },
    rose: { tile: "bg-rose-50 text-rose-600", chip: "bg-rose-50 text-rose-700" },
    mint: { tile: "bg-mint-50 text-mint-600", chip: "bg-mint-50 text-mint-700" },
  }[tone];

  return (
    <Card className="group relative overflow-hidden p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", tones.tile)}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <span className={cn("rounded-full px-2 py-1 text-[10px] font-semibold", tones.chip)}>
          {chip}
        </span>
      </div>
      <p className="mt-4 text-[30px] font-semibold leading-none tracking-tight tabular-nums text-ink-950">
        {value}
      </p>
      <p className="mt-2 text-[13px] font-medium text-ink-700">{label}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-400">{note}</p>
    </Card>
  );
}

function dueMeta(review: Review) {
  if (!review.dueAt) return null;
  if (isOverdue(review.dueAt)) {
    return {
      label: "Overdue",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  const diff = new Date(review.dueAt).getTime() - Date.now();
  if (diff < 24 * 60 * 60 * 1000) {
    return {
      label: `Due ${formatTime(review.dueAt)}`,
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  return {
    label: "Due tomorrow",
    className: "border-line bg-ink-50 text-ink-500",
  };
}

const ACTIVITY_ICONS: Record<string, typeof Activity> = {
  submitted: FilePlus2,
  analysis: Sparkles,
  finding: CheckCheck,
  comment: MessageSquare,
  version: History,
  decision: Stamp,
};

const ACTIVITY_TONES: Record<string, string> = {
  submitted: "bg-brand-50 text-brand-600",
  analysis: "bg-violet-50 text-violet-600",
  finding: "bg-emerald-50 text-emerald-600",
  comment: "bg-sky-50 text-sky-600",
  version: "bg-amber-50 text-amber-600",
  decision: "bg-ink-900 text-white",
};

const CATEGORY_COLORS: Record<string, string> = {
  Claims: "bg-brand-500",
  Disclosure: "bg-amber-500",
  Terminology: "bg-violet-500",
  Tone: "bg-sky-500",
  Regulatory: "bg-rose-500",
  Accessibility: "bg-emerald-500",
};

export default function OverviewPage() {
  const { reviews, loading, error, refresh } = useReviews();

  if (loading) return <OverviewSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Review overview"
          description="A human-in-the-loop workspace for pre-publication brand review."
        />
        <InlineAlert
          variant="danger"
          title="We couldn't load the review workspace"
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

  const activeReviews = reviews.filter((review) => statusIsOpen(review.status));
  const inReview = reviews.filter((review) => review.status === "in_review");
  const changesRequested = reviews.filter(
    (review) => review.status === "changes_requested",
  );
  const allFindings = reviews.flatMap((review) => review.findings);
  const openFindings = allFindings.filter((finding) => finding.status === "open");
  const openCritical = activeReviews.reduce(
    (total, review) =>
      total +
      review.findings.filter(
        (finding) =>
          finding.status === "open" && finding.severity === "critical",
      ).length,
    0,
  );
  const severity = countSeverity(allFindings);
  const averageScore = reviews.length
    ? Math.round(reviews.reduce((total, review) => total + review.score, 0) / reviews.length)
    : 0;
  const knowledgeGaps = reviews.reduce(
    (total, review) => total + review.knowledgeGaps.length,
    0,
  );

  const priority = [...activeReviews].sort((a, b) => {
    const aCritical = a.findings.filter(
      (finding) => finding.status === "open" && finding.severity === "critical",
    ).length;
    const bCritical = b.findings.filter(
      (finding) => finding.status === "open" && finding.severity === "critical",
    ).length;
    if (bCritical !== aCritical) return bCritical - aCritical;
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  });

  const categoryCounts = Array.from(
    allFindings.reduce((map, finding) => {
      map.set(finding.category, (map.get(finding.category) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const maxCategory = Math.max(1, ...categoryCounts.map(([, count]) => count));

  const recentActivity = reviews
    .flatMap((review) =>
      review.activity.map((event) => ({
        ...event,
        reviewId: review.id,
        reviewTitle: review.title,
      })),
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);

  const maxSeverity = Math.max(1, severity.critical, severity.high, severity.medium, severity.low);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow={
          <>
            <DemoBadge />
            <span className="text-[11px] font-medium text-ink-400">
              Aurelia Skin workspace
            </span>
          </>
        }
        title={`Good to see you, ${DEMO_USER.name.split(" ")[0]}.`}
        description="Here is what needs a human decision. Findings are evidence-linked and advisory; you stay in control."
        actions={
          <>
            <DemoGuideTrigger />
            <Link href="/submit" className={buttonStyles({ variant: "primary" })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New review
            </Link>
          </>
        }
      />

      <section
        className="relative overflow-hidden rounded-2xl bg-ink-950 text-white shadow-lift"
        aria-labelledby="demo-banner-title"
      >
        <div className="demo-grid absolute inset-0 opacity-60" aria-hidden="true" />
        <div
          className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-500/25 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-24 right-40 h-48 w-48 rounded-full bg-mint-400/10 blur-2xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-6 p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between xl:px-7">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-mint-300/20 bg-mint-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-mint-200">
                <span className="h-1.5 w-1.5 rounded-full bg-mint-300" />
                Demo workspace
              </span>
              <span className="text-[11px] font-medium text-white/35">
                Synthetic content · local mock engine
              </span>
            </div>
            <h2
              id="demo-banner-title"
              className="mt-3 text-xl font-semibold tracking-[-0.02em] sm:text-2xl"
            >
              From risky draft to a recorded human decision.
            </h2>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-white/55">
              Open the launch review, inspect cited findings, apply a fix or
              request changes, then complete the approval checklist. No API key
              or backend required.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href="/reviews/rev_glow_launch"
                className={buttonStyles({ variant: "primary" })}
              >
                Open the demo review
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <DemoGuideTrigger
                variant="secondary"
                className="border-white/15 bg-white/[0.06] text-white shadow-none hover:border-white/25 hover:bg-white/[0.11]"
                label="Walkthrough"
              />
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-2 xl:flex" aria-hidden="true">
            {[
              { label: "Draft", icon: FilePlus2 },
              { label: "7 cited findings", icon: Sparkles },
              { label: "Human decision", icon: Stamp },
            ].map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className="flex items-center gap-2">
                  <div className="w-[118px] rounded-xl border border-white/10 bg-white/[0.05] p-3">
                    <Icon className="h-4 w-4 text-mint-300" />
                    <p className="mt-2 text-[11px] font-semibold text-white/80">
                      {step.label}
                    </p>
                  </div>
                  {index < 2 && (
                    <ChevronRight className="h-4 w-4 text-white/20" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-label="Workspace summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Eye}
          label="Awaiting decision"
          value={inReview.length}
          note="Reviews ready for a named reviewer"
          tone="brand"
          chip="In review"
        />
        <SummaryCard
          icon={MessageSquareDot}
          label="Changes requested"
          value={changesRequested.length}
          note="With creators for revision"
          tone="amber"
          chip="Follow-up"
        />
        <SummaryCard
          icon={AlertOctagon}
          label="Open critical findings"
          value={openCritical}
          note="Blockers across active reviews"
          tone="rose"
          chip="Must resolve"
        />
        <SummaryCard
          icon={Gauge}
          label="Average compliance score"
          value={averageScore}
          note={`Across ${pluralize(reviews.length, "seeded review")}`}
          tone="mint"
          chip="Advisory"
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <Card className="overflow-hidden">
            <CardHeader
              title="Needs your attention"
              description="Prioritised by unresolved critical findings and due date."
              action={
                <Link
                  href="/reviews"
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  Open queue
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              }
            />
            {priority.length === 0 ? (
              <div className="p-5 sm:p-6">
                <EmptyState
                  icon={CheckCheck}
                  title="The queue is clear"
                  description="No reviews are waiting for a decision. Submit new content to run the next compliance check."
                  compact
                  action={
                    <Link href="/submit" className={buttonStyles({ size: "sm" })}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      New review
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="divide-y divide-line">
                {priority.map((review) => {
                  const critical = review.findings.filter(
                    (finding) =>
                      finding.status === "open" && finding.severity === "critical",
                  ).length;
                  const open = review.findings.filter(
                    (finding) => finding.status === "open",
                  ).length;
                  const due = dueMeta(review);
                  return (
                    <Link
                      key={review.id}
                      href={`/reviews/${review.id}`}
                      className="group flex items-start gap-3.5 p-4 transition hover:bg-ink-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:gap-4 sm:px-6 sm:py-5"
                    >
                      <ScoreRing score={review.score} size={48} hideLabel strokeWidth={4.5} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-ink-900 transition group-hover:text-brand-700 sm:text-sm">
                              {review.title}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-ink-400">
                              {review.channel} · {review.submittedBy} · updated{" "}
                              {formatRelative(review.updatedAt)}
                            </p>
                          </div>
                          <ChevronRight
                            className="mt-1 hidden h-4 w-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500 sm:block"
                            aria-hidden="true"
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={review.status} />
                          {critical > 0 && (
                            <Badge className="border-rose-200 bg-rose-50 text-rose-700">
                              <AlertOctagon className="h-3 w-3" aria-hidden="true" />
                              {critical} critical
                            </Badge>
                          )}
                          <Badge className="border-line bg-ink-50 text-ink-500">
                            {open} open {open === 1 ? "finding" : "findings"}
                          </Badge>
                          {review.knowledgeGaps.length > 0 && (
                            <Badge className="border-violet-200 bg-violet-50 text-violet-700">
                              {review.knowledgeGaps.length} knowledge gap
                            </Badge>
                          )}
                          {due && (
                            <Badge className={due.className}>
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {due.label}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Recent activity"
              description="Decisions, versions and comments across the workspace."
              action={
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-400">
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  Live demo log
                </span>
              }
            />
            <ul className="divide-y divide-line">
              {recentActivity.map((event) => {
                const Icon = ACTIVITY_ICONS[event.type] ?? Activity;
                return (
                  <li key={event.id}>
                    <Link
                      href={`/reviews/${event.reviewId}`}
                      className="flex items-start gap-3 px-4 py-3.5 transition hover:bg-ink-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:px-6"
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          ACTIVITY_TONES[event.type] ?? "bg-ink-100 text-ink-500",
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] leading-snug text-ink-700">
                          {event.message}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-ink-400">
                          {event.actor} · {event.reviewTitle} ·{" "}
                          {formatRelative(event.at)}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <Card className="overflow-hidden">
            <CardHeader
              title="Compliance pulse"
              description="Average advisory score and open findings."
              action={
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-ink-50 px-2 py-1 text-[10px] font-semibold text-ink-500">
                  <TrendingUp className="h-3 w-3" aria-hidden="true" />
                  Advisory
                </span>
              }
            />
            <CardBody className="space-y-5">
              <div className="flex items-center gap-4">
                <ScoreRing score={averageScore} size={104} strokeWidth={5} />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink-900">
                    Workspace average
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                    Across {pluralize(reviews.length, "review")} and{" "}
                    {pluralize(allFindings.length, "finding")}.
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-ink-50 px-2 py-1 text-[10px] font-medium text-ink-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-mint-500" />
                    {openFindings.length} open
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {(
                  [
                    ["critical", "Critical", severity.critical, "bg-rose-500"],
                    ["high", "High", severity.high, "bg-orange-500"],
                    ["medium", "Medium", severity.medium, "bg-amber-500"],
                    ["low", "Low", severity.low, "bg-sky-500"],
                  ] as const
                ).map(([key, label, count, color]) => (
                  <div key={key}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 font-medium text-ink-600">
                        <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
                        {label}
                      </span>
                      <span className="font-semibold tabular-nums text-ink-800">
                        {count}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className={cn("h-full rounded-full transition-all duration-700", color)}
                        style={{ width: `${(count / maxSeverity) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                <div>
                  <p className="text-[11px] font-semibold text-violet-900">
                    {knowledgeGaps} knowledge {knowledgeGaps === 1 ? "gap" : "gaps"}
                  </p>
                  <p className="text-[10px] leading-relaxed text-violet-700/70">
                    Needs human verification
                  </p>
                </div>
                <Link
                  href="/insights"
                  className="rounded-lg p-1.5 text-violet-700 transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  aria-label="View knowledge gaps in insights"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Recurring issues"
              description="Most frequent finding categories."
              action={
                <Link
                  href="/insights"
                  className="text-[11px] font-semibold text-brand-600 transition hover:text-brand-700"
                >
                  Insights
                </Link>
              }
            />
            <CardBody className="space-y-4">
              {categoryCounts.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-400">
                  No findings yet. Run a review to see patterns.
                </p>
              ) : (
                categoryCounts.map(([category, count]) => (
                  <div key={category}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-ink-600">{category}</span>
                      <span className="font-semibold tabular-nums text-ink-800">
                        {count}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-700",
                          CATEGORY_COLORS[category] ?? "bg-brand-500",
                        )}
                        style={{ width: `${(count / maxCategory) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
              <p className="border-t border-line pt-3 text-[10px] leading-relaxed text-ink-400">
                Counts include every finding in the demo workspace, resolved or
                open. Use insights to see acceptance rates.
              </p>
            </CardBody>
          </Card>

          <Card className="overflow-hidden border-ink-200/70 bg-white">
            <CardBody className="flex items-start gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink-500">
                <Inbox className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold text-ink-900">
                  Review queue
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">
                  {activeReviews.length} active · {reviews.length} total demo
                  reviews
                </p>
                <Link
                  href="/reviews"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                >
                  Browse all reviews
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
