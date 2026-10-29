"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  CalendarClock,
  ChevronRight,
  Eye,
  EyeOff,
  FilterX,
  Inbox,
  Lock,
  LogIn,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useReviews } from "@/components/providers/review-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ui/score-ring";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Button, buttonStyles } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { ListSkeleton } from "@/components/ui/skeletons";
import { Avatar } from "@/components/ui/avatar";
import { formatRelative, isOverdue } from "@/lib/format";
import { REVIEW_FILTERS } from "@/lib/review-config";
import { cn } from "@/lib/utils";
import type { ReviewStatus } from "@/lib/types";

type SortMode = "recent" | "risk" | "score" | "oldest";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "recent", label: "Recently updated" },
  { value: "risk", label: "Highest risk first" },
  { value: "score", label: "Lowest score first" },
  { value: "oldest", label: "Oldest first" },
];

export default function ReviewsPage() {
  const { reviews, loading, error, refresh } = useReviews();
  const { isAuthenticated, setLoginModalOpen } = useAuth();
  const [auditsRequested, setAuditsRequested] = useState(false);
  const [status, setStatus] = useState<ReviewStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");

  const counts = useMemo(() => {
    return REVIEW_FILTERS.reduce<Record<string, number>>((acc, filter) => {
      acc[filter.value] =
        filter.value === "all"
          ? reviews.length
          : reviews.filter((review) => review.status === filter.value).length;
      return acc;
    }, {});
  }, [reviews]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = reviews.filter((review) => {
      if (status !== "all" && review.status !== status) return false;
      if (!normalized) return true;
      const haystack = [
        review.title,
        review.channel,
        review.submittedBy,
        review.status.replace("_", " "),
        ...review.findings.map((finding) => finding.title),
        ...review.findings.map((finding) => finding.ruleCode),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });

    return [...matches].sort((a, b) => {
      if (sort === "oldest") {
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      if (sort === "score") return a.score - b.score;
      if (sort === "risk") {
        const aCritical = a.findings.filter(
          (finding) =>
            finding.status === "open" && finding.severity === "critical",
        ).length;
        const bCritical = b.findings.filter(
          (finding) =>
            finding.status === "open" && finding.severity === "critical",
        ).length;
        if (bCritical !== aCritical) return bCritical - aCritical;
        return a.score - b.score;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [reviews, status, query, sort]);

  // 1. Require login before showing review queue audits
  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-xl font-semibold text-ink-950">
            Sign in to view Review Audits
          </h1>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-500">
            Review audits and compliance findings are restricted to authenticated workspace members.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" size="md" onClick={() => setLoginModalOpen(true)}>
              <LogIn className="h-4 w-4" />
              Sign in
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (loading) return <ListSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Review queue" description="All content submitted for compliance review." />
        <InlineAlert
          variant="danger"
          title="The review queue could not load"
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

  const hasFilters = status !== "all" || query.trim().length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Review queue"
        description="Inspect evidence-linked findings and record human review decisions on demand."
        actions={
          <div className="flex items-center gap-2">
            {auditsRequested && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAuditsRequested(false)}
              >
                <EyeOff className="h-4 w-4" />
                Hide audits
              </Button>
            )}
            <Link href="/submit" className={buttonStyles({ variant: "primary" })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New review
            </Link>
          </div>
        }
      />

      {!auditsRequested ? (
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-ink-50 text-ink-500">
            <Inbox className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-ink-900">
            Ready to load {reviews.length} review audits
          </h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-ink-500">
            Click below to load the compliance review queue and audit findings for your workspace.
          </p>
          <div className="mt-5">
            <Button
              variant="primary"
              size="md"
              onClick={() => setAuditsRequested(true)}
            >
              <Eye className="h-4 w-4" />
              Load Review Audits ({reviews.length})
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-line p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div
              className="scrollbar-slim flex gap-1 overflow-x-auto"
              role="tablist"
              aria-label="Filter reviews by status"
            >
              {REVIEW_FILTERS.map((filter) => {
                const active = status === filter.value;
                return (
                  <button
                    key={filter.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStatus(filter.value)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                      active
                        ? "bg-ink-900 text-white shadow-sm"
                        : "text-ink-500 hover:bg-ink-100 hover:text-ink-800",
                    )}
                  >
                    {filter.label}
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] tabular-nums",
                        active
                          ? "bg-white/15 text-white"
                          : "bg-ink-100 text-ink-500",
                      )}
                    >
                      {counts[filter.value] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1 sm:w-60">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search reviews..."
                  aria-label="Search reviews"
                  className="h-9 w-full rounded-xl border border-line bg-ink-50/60 pl-9 pr-3 text-xs text-ink-900 placeholder:text-ink-400 transition focus:border-brand-500 focus:bg-white focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal
                  className="hidden h-3.5 w-3.5 text-ink-400 sm:block"
                  aria-hidden="true"
                />
                <Select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortMode)}
                  aria-label="Sort reviews"
                  className="h-9 w-full py-1 text-xs sm:w-44"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={hasFilters ? FilterX : Inbox}
                title={hasFilters ? "No matching reviews" : "No reviews yet"}
                description={
                  hasFilters
                    ? "Try clearing your search or status filter."
                    : "Submit content to start a review."
                }
                action={
                  hasFilters ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setStatus("all");
                        setQuery("");
                      }}
                    >
                      Reset filters
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-line" aria-label="Reviews">
              {filtered.map((review) => {
                const openFindings = review.findings.filter(
                  (finding) => finding.status === "open",
                );
                const criticalCount = openFindings.filter(
                  (finding) => finding.severity === "critical",
                ).length;
                const overdue =
                  review.dueAt &&
                  isOverdue(review.dueAt) &&
                  (review.status === "in_review" ||
                    review.status === "changes_requested");

                return (
                  <li key={review.id}>
                    <Link
                      href={`/reviews/${review.id}`}
                      className="group flex flex-col gap-3 p-4 transition hover:bg-ink-50/70 sm:flex-row sm:items-center sm:gap-4 sm:px-6"
                    >
                      <div className="flex items-center gap-3.5 sm:flex-1 min-w-0">
                        <ScoreRing
                          score={review.score}
                          size={46}
                          hideLabel
                          strokeWidth={4}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-ink-900 group-hover:text-brand-700">
                              {review.title}
                            </p>
                            <StatusBadge status={review.status} />
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
                            <span className="font-medium text-ink-600">
                              {review.channel}
                            </span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1.5">
                              <Avatar name={review.submittedBy} size="xs" />
                              {review.submittedBy}
                            </span>
                            <span>·</span>
                            <span>Updated {formatRelative(review.updatedAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pl-14 sm:justify-end sm:pl-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {criticalCount > 0 && (
                            <Badge className="border-rose-200 bg-rose-50 text-rose-700">
                              <AlertOctagon className="h-3 w-3" aria-hidden="true" />
                              {criticalCount} critical
                            </Badge>
                          )}
                          <Badge className="border-line bg-ink-50 text-ink-600">
                            {openFindings.length} open
                          </Badge>
                          {overdue && (
                            <Badge className="border-rose-200 bg-rose-50 text-rose-700">
                              <CalendarClock className="h-3 w-3" aria-hidden="true" />
                              Overdue
                            </Badge>
                          )}
                        </div>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-600"
                          aria-hidden="true"
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
