"use client";

import Link from "next/link";
import {
  Accessibility,
  AlertOctagon,
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  CheckCheck,
  CheckCircle2,
  FlaskConical,
  Gauge,
  Lightbulb,
  Megaphone,
  MessageCircle,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { useReviews } from "@/components/providers/review-provider";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ScoreRing } from "@/components/ui/score-ring";
import { OverviewSkeleton } from "@/components/ui/skeletons";
import { countSeverity, scoreTone } from "@/lib/review-config";
import { cn, pluralize } from "@/lib/utils";
import type { FindingCategory } from "@/lib/types";

const CATEGORY_META_LOCAL: Record<
  FindingCategory,
  { icon: typeof FlaskConical; bar: string; tone: string }
> = {
  Claims: {
    icon: FlaskConical,
    bar: "bg-brand-500",
    tone: "bg-brand-50 text-brand-600",
  },
  Disclosure: {
    icon: Megaphone,
    bar: "bg-amber-500",
    tone: "bg-amber-50 text-amber-700",
  },
  Terminology: {
    icon: BookOpen,
    bar: "bg-violet-500",
    tone: "bg-violet-50 text-violet-600",
  },
  Tone: {
    icon: MessageCircle,
    bar: "bg-sky-500",
    tone: "bg-sky-50 text-sky-600",
  },
  Regulatory: {
    icon: Scale,
    bar: "bg-rose-500",
    tone: "bg-rose-50 text-rose-600",
  },
  Accessibility: {
    icon: Accessibility,
    bar: "bg-emerald-500",
    tone: "bg-emerald-50 text-emerald-600",
  },
};

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value: string | number;
  note: string;
  tone: "brand" | "amber" | "rose" | "mint";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-600",
    mint: "bg-mint-50 text-mint-600",
  }[tone];

  return (
    <Card className="p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            tones,
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-[26px] font-semibold leading-none tracking-tight tabular-nums text-ink-950">
        {value}
      </p>
      <p className="mt-1.5 text-[12px] font-medium text-ink-700">{label}</p>
      <p className="mt-0.5 text-[10px] leading-relaxed text-ink-400">{note}</p>
    </Card>
  );
}

export default function InsightsPage() {
  const { reviews, loading, error, refresh } = useReviews();

  if (loading) return <OverviewSkeleton />;

  if (error) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Compliance insights"
          description="Patterns derived from the reviews in this demo workspace."
        />
        <InlineAlert
          variant="danger"
          title="Insights could not load"
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

  if (reviews.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow={<DemoBadge />}
          title="Compliance insights"
          description="Patterns are derived from reviews in this demo workspace."
        />
        <EmptyState
          icon={TrendingUp}
          title="No reviews to analyse yet"
          description="Run your first compliance review to see finding patterns, resolution habits and knowledge gaps."
          action={
            <Link href="/submit" className={buttonStyles({ size: "sm" })}>
              Start a review
            </Link>
          }
        />
      </div>
    );
  }

  const allFindings = reviews.flatMap((review) => review.findings);
  const openFindings = allFindings.filter((finding) => finding.status === "open");
  const severity = countSeverity(allFindings);
  const acceptedFixes = allFindings.filter(
    (finding) => finding.status === "accepted" || finding.status === "edited",
  ).length;
  const dismissed = allFindings.filter(
    (finding) => finding.status === "dismissed",
  ).length;
  const humanResolved = acceptedFixes + dismissed;
  const acceptanceRate = humanResolved
    ? Math.round((acceptedFixes / humanResolved) * 100)
    : null;
  const averageScore = Math.round(
    reviews.reduce((total, review) => total + review.score, 0) / reviews.length,
  );
  const averageTone = scoreTone(averageScore);

  const approved = reviews.filter((review) => review.status === "approved").length;
  const rejected = reviews.filter((review) => review.status === "rejected").length;
  const inReview = reviews.filter((review) => review.status === "in_review").length;
  const changesRequested = reviews.filter(
    (review) => review.status === "changes_requested",
  ).length;
  const decided = approved + rejected;
  const approvalRate = decided ? Math.round((approved / decided) * 100) : null;

  const categoryCounts = Array.from(
    allFindings.reduce((map, finding) => {
      map.set(finding.category, (map.get(finding.category) ?? 0) + 1);
      return map;
    }, new Map<FindingCategory, number>()),
  ).sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(1, ...categoryCounts.map(([, count]) => count));
  const topCategory = categoryCounts[0]?.[0] ?? null;

  const ruleCounts = Array.from(
    allFindings.reduce((map, finding) => {
      const current = map.get(finding.ruleCode) ?? {
        code: finding.ruleCode,
        title: finding.title,
        total: 0,
        open: 0,
      };
      current.total += 1;
      if (finding.status === "open") current.open += 1;
      map.set(finding.ruleCode, current);
      return map;
    }, new Map<string, { code: string; title: string; total: number; open: number }>()),
  )
    .map(([, value]) => value)
    .sort((a, b) => b.total - a.total || b.open - a.open)
    .slice(0, 6);
  const topRule = ruleCounts[0] ?? null;

  const knowledgeGaps = reviews
    .flatMap((review) =>
      review.knowledgeGaps.map((gap) => ({
        ...gap,
        reviewId: review.id,
        reviewTitle: review.title,
        channel: review.channel,
      })),
    );
  const knowledgeGapCount = knowledgeGaps.length;
  const visibleKnowledgeGaps = knowledgeGaps.slice(0, 5);

  const channels = Array.from(
    reviews.reduce((map, review) => {
      const current = map.get(review.channel) ?? {
        channel: review.channel,
        count: 0,
        scoreTotal: 0,
        open: 0,
        critical: 0,
      };
      current.count += 1;
      current.scoreTotal += review.score;
      current.open += review.findings.filter(
        (finding) => finding.status === "open",
      ).length;
      current.critical += review.findings.filter(
        (finding) =>
          finding.status === "open" && finding.severity === "critical",
      ).length;
      map.set(review.channel, current);
      return map;
    }, new Map<string, { channel: string; count: number; scoreTotal: number; open: number; critical: number }>()),
  )
    .map(([, value]) => ({
      channel: value.channel,
      count: value.count,
      averageScore: Math.round(value.scoreTotal / value.count),
      open: value.open,
      critical: value.critical,
    }))
    .sort((a, b) => b.count - a.count || a.averageScore - b.averageScore);
  const maxChannelCount = Math.max(1, ...channels.map((channel) => channel.count));

  const decisionMix = [
    {
      label: "Approved",
      value: approved,
      color: "bg-emerald-500",
      text: "text-emerald-700",
    },
    {
      label: "Rejected",
      value: rejected,
      color: "bg-rose-500",
      text: "text-rose-700",
    },
    {
      label: "Changes requested",
      value: changesRequested,
      color: "bg-amber-500",
      text: "text-amber-800",
    },
    {
      label: "In review",
      value: inReview,
      color: "bg-brand-500",
      text: "text-brand-700",
    },
  ];

  const resolutionMix = [
    {
      label: "Accepted fixes",
      value: allFindings.filter((finding) => finding.status === "accepted").length,
      color: "bg-emerald-500",
    },
    {
      label: "Custom edits",
      value: allFindings.filter((finding) => finding.status === "edited").length,
      color: "bg-brand-500",
    },
    {
      label: "Dismissed",
      value: dismissed,
      color: "bg-ink-400",
    },
    {
      label: "Still open",
      value: openFindings.length,
      color: "bg-amber-400",
    },
  ];

  const severityBars = (
    [
      ["critical", "Critical", severity.critical, "bg-rose-500"],
      ["high", "High", severity.high, "bg-orange-500"],
      ["medium", "Medium", severity.medium, "bg-amber-500"],
      ["low", "Low", severity.low, "bg-sky-500"],
    ] as const
  );
  const maxSeverity = Math.max(
    1,
    severity.critical,
    severity.high,
    severity.medium,
    severity.low,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <DemoBadge />
            <span className="text-[11px] font-medium text-ink-400">
              Derived from {pluralize(reviews.length, "review")}
            </span>
          </>
        }
        title="Compliance insights"
        description="Where findings cluster, how reviewers respond and which knowledge gaps keep recurring. All numbers come from the local demo workspace."
        actions={
          <>
            <Link href="/policies" className={buttonStyles({ variant: "secondary" })}>
              Brand knowledge
            </Link>
            <Link href="/reviews" className={buttonStyles({ variant: "primary" })}>
              Open review queue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </>
        }
      />

      <section
        aria-label="Compliance metrics"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          icon={Gauge}
          label="Average advisory score"
          value={averageScore}
          note={`${averageTone.label} · across all ${pluralize(reviews.length, "review")}`}
          tone="mint"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Human decisions"
          value={decided}
          note={
            decided
              ? `${approvalRate}% approved · ${rejected} rejected`
              : "No final decisions yet"
          }
          tone="brand"
        />
        <MetricCard
          icon={CheckCheck}
          label="Fix acceptance rate"
          value={acceptanceRate === null ? "—" : `${acceptanceRate}%`}
          note={
            humanResolved
              ? `${acceptedFixes} of ${humanResolved} reviewed findings acted on`
              : "No findings resolved yet"
          }
          tone="amber"
        />
        <MetricCard
          icon={AlertOctagon}
          label="Open findings"
          value={openFindings.length}
          note={`${severity.critical} critical · ${severity.high} high severity`}
          tone="rose"
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <Card className="overflow-hidden">
            <CardHeader
              title="Findings by category"
              description="Which policy areas create the most review work."
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Target className="h-4 w-4" aria-hidden="true" />
                </span>
              }
              action={
                <Badge className="border-line bg-white text-ink-500 normal-case tracking-normal">
                  {allFindings.length} findings
                </Badge>
              }
            />
            <CardBody className="space-y-4">
              {categoryCounts.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-400">
                  No findings recorded yet.
                </p>
              ) : (
                categoryCounts.map(([category, count]) => {
                  const meta = CATEGORY_META_LOCAL[category];
                  const Icon = meta.icon;
                  const percentage = Math.round((count / allFindings.length) * 100);
                  return (
                    <div key={category}>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-md",
                            meta.tone,
                          )}
                        >
                          <Icon className="h-3 w-3" aria-hidden="true" />
                        </span>
                        <span className="text-[12px] font-medium text-ink-700">
                          {category}
                        </span>
                        <span className="ml-auto text-[11px] tabular-nums text-ink-400">
                          {count} · {percentage}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700",
                            meta.bar,
                          )}
                          style={{ width: `${(count / maxCategory) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Most frequently triggered rules"
              description="Use these in creator briefs and pre-flight guidance."
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                </span>
              }
            />
            {ruleCounts.length === 0 ? (
              <div className="p-5 text-center text-xs text-ink-400">
                No rules have been triggered yet.
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {ruleCounts.map((rule, index) => (
                  <li
                    key={rule.code}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-50 text-[10px] font-bold tabular-nums text-ink-500">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge className="border-line bg-ink-50 font-mono text-[9px] tracking-normal text-ink-500">
                          {rule.code}
                        </Badge>
                        <span className="text-[12px] font-medium text-ink-800">
                          {rule.title}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-[10px]">
                      {rule.open > 0 && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                          {rule.open} open
                        </span>
                      )}
                      <span className="font-semibold tabular-nums text-ink-700">
                        {rule.total}
                      </span>
                      <span className="text-ink-400">total</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Review load by channel"
              description="Where work is concentrated and which channels are highest risk."
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                </span>
              }
            />
            <ul className="divide-y divide-line">
              {channels.map((channel) => (
                <li
                  key={channel.channel}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6"
                >
                  <div className="w-[112px] shrink-0">
                    <p className="truncate text-[12px] font-medium text-ink-800">
                      {channel.channel}
                    </p>
                    <p className="text-[10px] text-ink-400">
                      {pluralize(channel.count, "review")}
                    </p>
                  </div>
                  <div className="min-w-[80px] flex-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{
                          width: `${Math.max(8, (channel.count / maxChannelCount) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ScoreRing
                      score={channel.averageScore}
                      size={34}
                      hideLabel
                      strokeWidth={4}
                    />
                    <div className="text-right text-[10px]">
                      <p className="font-semibold text-ink-700">
                        {channel.open} open
                      </p>
                      <p
                        className={cn(
                          channel.critical > 0
                            ? "font-semibold text-rose-600"
                            : "text-ink-400",
                        )}
                      >
                        {channel.critical > 0
                          ? `${channel.critical} critical`
                          : "No critical"}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Knowledge gaps"
              description="Questions the approved library cannot answer yet."
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                </span>
              }
              action={
                <Badge className="border-violet-200 bg-violet-50 text-violet-700 normal-case tracking-normal">
                  {knowledgeGapCount} to verify
                </Badge>
              }
            />
            {knowledgeGaps.length === 0 ? (
              <div className="flex items-center gap-2.5 px-5 py-5 text-[11px] text-ink-400 sm:px-6">
                <CheckCircle2
                  className="h-4 w-4 text-emerald-600"
                  aria-hidden="true"
                />
                No knowledge gaps in the current review set.
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {visibleKnowledgeGaps.map((gap) => (
                  <li key={gap.id}>
                    <Link
                      href={`/reviews/${gap.reviewId}`}
                      className="group flex items-start gap-3 px-5 py-3.5 transition hover:bg-ink-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:px-6"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                        <BookOpenCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-ink-800 group-hover:text-brand-700">
                          {gap.topic}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-ink-400">
                          {gap.reviewTitle} · {gap.channel} ·{" "}
                          {Math.round(gap.confidence * 100)}% confidence
                        </p>
                      </div>
                      <ArrowRight
                        className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-4 xl:col-span-4">
          <Card className="overflow-hidden">
            <CardHeader
              title="Decision mix"
              description="All reviews in the workspace."
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-white">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                </span>
              }
            />
            <CardBody className="space-y-4">
              <div
                className="flex h-2.5 overflow-hidden rounded-full bg-ink-100"
                role="img"
                aria-label={decisionMix
                  .map((item) => `${item.label}: ${item.value}`)
                  .join(", ")}
              >
                {decisionMix.map((item) =>
                  item.value > 0 ? (
                    <div
                      key={item.label}
                      className={item.color}
                      style={{ width: `${(item.value / reviews.length) * 100}%` }}
                    />
                  ) : null,
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {decisionMix.map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center gap-1.5">
                      <span className={cn("h-2 w-2 rounded-full", item.color)} />
                      <span className="text-[10px] font-medium text-ink-500">
                        {item.label}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-0.5 text-lg font-semibold tabular-nums",
                        item.text,
                      )}
                    >
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Finding resolution"
              description="What happened to every finding."
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <CheckCheck className="h-4 w-4" aria-hidden="true" />
                </span>
              }
            />
            <CardBody className="space-y-3">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-100">
                {resolutionMix.map((item) =>
                  item.value > 0 && allFindings.length > 0 ? (
                    <div
                      key={item.label}
                      className={item.color}
                      style={{
                        width: `${(item.value / allFindings.length) * 100}%`,
                      }}
                    />
                  ) : null,
                )}
              </div>
              {resolutionMix.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className="flex items-center gap-1.5 text-ink-500">
                    <span className={cn("h-1.5 w-1.5 rounded-full", item.color)} />
                    {item.label}
                  </span>
                  <span className="font-semibold tabular-nums text-ink-800">
                    {item.value}
                  </span>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Severity mix"
              description="Every finding, resolved or open."
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                  <AlertOctagon className="h-4 w-4" aria-hidden="true" />
                </span>
              }
            />
            <CardBody className="space-y-3.5">
              {severityBars.map(([key, label, count, color]) => (
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
                      className={cn("h-full rounded-full", color)}
                      style={{ width: `${(count / maxSeverity) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <div className="relative overflow-hidden rounded-2xl bg-ink-950 p-5 text-white shadow-lift">
            <div className="demo-grid absolute inset-0 opacity-50" aria-hidden="true" />
            <div
              className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-brand-500/25 blur-2xl"
              aria-hidden="true"
            />
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-mint-300/20 bg-mint-300/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-mint-200">
                <Lightbulb className="h-3 w-3" aria-hidden="true" />
                What this suggests
              </span>
              <p className="mt-3 text-[13px] font-semibold leading-snug">
                {topCategory && topRule
                  ? `${topCategory} is the biggest review driver, led by ${topRule.code}.`
                  : "There is not enough data to identify a pattern yet."}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-white/50">
                {topCategory && topRule
                  ? `${categoryCounts[0][1]} findings sit in ${topCategory}, and ${topRule.code} has appeared ${pluralize(topRule.total, "time")}. Use the rule library to brief creators before the next campaign.`
                  : "Submit more reviews to see recurring categories and rules."}
              </p>
              {knowledgeGapCount > 0 && (
                <p className="mt-2 text-[10px] leading-relaxed text-violet-200/60">
                  {pluralize(knowledgeGapCount, "knowledge gap")} still need a
                  human answer. These are product or legal decisions, not copy
                  edits.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/policies"
                  className={buttonStyles({
                    variant: "secondary",
                    size: "sm",
                    className:
                      "border-white/15 bg-white/[0.06] text-white shadow-none hover:border-white/25 hover:bg-white/[0.11]",
                  })}
                >
                  Open rule library
                </Link>
                <Link
                  href="/reviews"
                  className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  Review queue
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-2xl border border-line bg-white p-4 text-[10px] leading-relaxed text-ink-400 shadow-card">
            <Sparkles
              className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"
              aria-hidden="true"
            />
            <p>
              Metrics are calculated live from the seeded reviews stored in this
              browser. Resetting the demo returns every number to its original
              state.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
