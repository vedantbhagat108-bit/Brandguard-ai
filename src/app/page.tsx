"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  ArrowRight,
  CheckCheck,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Gauge,
  Image as ImageIcon,
  Lock,
  LogIn,
  MessageSquareDot,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useReviews } from "@/components/providers/review-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ui/score-ring";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { OverviewSkeleton } from "@/components/ui/skeletons";
import { Button, buttonStyles } from "@/components/ui/button";
import { formatRelative, formatTime, isOverdue } from "@/lib/format";
import { DEMO_USER, statusIsOpen } from "@/lib/review-config";
import { cn } from "@/lib/utils";
import type { Review } from "@/lib/types";

function SummaryCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof Eye;
  label: string;
  value: string | number;
  note: string;
  tone: "brand" | "amber" | "mint";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    amber: "bg-amber-50 text-amber-600",
    mint: "bg-mint-50 text-mint-600",
  }[tone];

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-ink-500">{label}</span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tones)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-ink-950">
        {value}
      </p>
      <p className="mt-1 text-xs text-ink-400">{note}</p>
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
  return null;
}

export default function OverviewPage() {
  const { reviews, loading, error, refresh } = useReviews();
  const { user, isAuthenticated, setLoginModalOpen } = useAuth();
  const [showAudits, setShowAudits] = useState(false);

  // 1. Gate review audits behind authentication
  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <Card className="p-8 sm:p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink-950">
            Welcome to BrandLens AI Governance
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-500">
            Sign in to your organization workspace to submit drafts, inspect brand policies, manage approved visual assets, or request review audits when needed.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={() => setLoginModalOpen(true)}
            >
              <LogIn className="h-4 w-4" />
              Sign in to Workspace
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (loading) return <OverviewSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Workspace overview"
          description="Human-in-the-loop brand governance."
        />
        <InlineAlert
          variant="danger"
          title="We couldn't load the workspace"
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
  const averageScore = reviews.length
    ? Math.round(reviews.reduce((total, review) => total + review.score, 0) / reviews.length)
    : 0;

  const priority = [...activeReviews].sort((a, b) => {
    const aCritical = a.findings.filter(
      (finding) => finding.status === "open" && finding.severity === "critical",
    ).length;
    const bCritical = b.findings.filter(
      (finding) => finding.status === "open" && finding.severity === "critical",
    ).length;
    if (bCritical !== aCritical) return bCritical - aCritical;
    return a.score - b.score;
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow={
          <span className="text-xs font-medium text-ink-400">
            {user.brand_name || "EcoFresh Botanicals"} · {user.roleLabel}
          </span>
        }
        title={`Hello, ${(user.name || DEMO_USER.name).split(" ")[0]}`}
        description="Submit new content for review, manage visual assets, or load active review audits on demand."
        actions={
          <>
            <Link href="/visual-assets" className={buttonStyles({ variant: "secondary" })}>
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
              Visual assets
            </Link>
            <Link href="/submit" className={buttonStyles({ variant: "primary" })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New review
            </Link>
          </>
        }
      />

      {/* Clean, uncrowded 3-card summary */}
      <section aria-label="Workspace summary" className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={Eye}
          label="Awaiting decision"
          value={inReview.length}
          note="Ready for reviewer sign-off"
          tone="brand"
        />
        <SummaryCard
          icon={MessageSquareDot}
          label="Changes requested"
          value={changesRequested.length}
          note="Returned to creators for revision"
          tone="amber"
        />
        <SummaryCard
          icon={Gauge}
          label="Average compliance score"
          value={`${averageScore}/100`}
          note="Advisory workspace baseline"
          tone="mint"
        />
      </section>

      {/* Review Audits — Only shown when explicitly asked by the user */}
      {!showAudits ? (
        <Card className="flex flex-col items-center justify-between gap-4 p-6 sm:flex-row">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">
              Review Audits ({priority.length} active)
            </h2>
            <p className="mt-1 text-xs text-ink-500">
              Detailed review audits and findings stay hidden until you ask to view them.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAudits(true)}
          >
            <Eye className="h-4 w-4" />
            Show Review Audits
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            title="Active Review Audits"
            description="Click any submission to inspect cited findings and record a decision."
            action={
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAudits(false)}
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Hide audits
                </Button>
                <Link
                  href="/reviews"
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50"
                >
                  Full queue
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            }
          />
          {priority.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CheckCheck}
                title="No active review audits"
                description="All submissions have been resolved."
                compact
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
                    className="group flex items-center gap-4 p-4 transition hover:bg-ink-50/60 sm:px-6"
                  >
                    <ScoreRing score={review.score} size={44} hideLabel strokeWidth={4} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-ink-900 group-hover:text-brand-700">
                          {review.title}
                        </p>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-400">
                        {review.channel} · {review.submittedBy} · {formatRelative(review.updatedAt)}
                      </p>
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
      )}
    </div>
  );
}
