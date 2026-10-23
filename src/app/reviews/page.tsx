"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  ArrowRight,
  CalendarClock,
  ChevronRight,
  FilterX,
  Inbox,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useReviews } from "@/components/providers/review-provider";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge, DemoBadge, StatusBadge } from "@/components/ui/badge";
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

  const hasFilters = status !== "all" || query.trim().length > 0;

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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<DemoBadge />}
        title="Review queue"
        description="Inspect evidence-linked findings, collaborate with creators and record a human decision."
        actions={
          <Link href="/submit" className={buttonStyles({ variant: "primary" })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New review
          </Link>
        }
      />

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
                        ? "bg-white/15 text-white/80"
                        : "bg-ink-100 text-ink-400",
                    )}
                  >
                    {counts[filter.value] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title, creator or rule…"
                className="h-9 w-full rounded-lg border border-line bg-white pr-3 text-xs text-ink-900 shadow-sm outline-none transition placeholder:text-ink-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 sm:w-[230px]"
                style={{ paddingLeft: "2.15rem" }}
                aria-label="Search reviews"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="hidden h-3.5 w-3.5 text-ink-400 sm:block" aria-hidden="true" />
              <label htmlFor="review-sort" className="sr-only">
                Sort reviews
              </label>
              <Select
                id="review-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                className="h-9 w-full min-w-[164px] text-xs sm:w-auto"
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

        <div className="flex items-center justify-between gap-3 border-b border-line bg-ink-50/40 px-4 py-2.5 sm:px-5">
          <p className="text-[11px] font-medium text-ink-500">
            {filtered.length} of {reviews.length} reviews
            {hasFilters && " matching filters"}
          </p>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setStatus("all");
                  setQuery("");
                }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-ink-500 transition hover:bg-white hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <FilterX className="h-3 w-3" aria-hidden="true" />
                Clear
              </button>
            )}
            <span className="hidden items-center gap-1 text-[11px] text-ink-400 sm:flex">
              <Inbox className="h-3 w-3" aria-hidden="true" />
              Demo workspace
            </span>
          </div>
        </div>

        <div className="hidden grid-cols-[minmax(0,1fr)_128px_104px_112px_96px_32px] items-center gap-3 border-b border-line bg-white px-5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400 lg:grid">
          <span>Review</span>
          <span>Status</span>
          <span>Findings</span>
          <span>Creator</span>
          <span>Updated</span>
          <span className="sr-only">Open</span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              icon={hasFilters ? FilterX : Inbox}
              title={hasFilters ? "No reviews match these filters" : "No reviews yet"}
              description={
                hasFilters
                  ? "Try a different status or search term. All demo reviews are stored locally in this browser."
                  : "Submit your first piece of content to see evidence-linked policy findings."
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
                    Clear filters
                  </Button>
                ) : (
                  <Link href="/submit" className={buttonStyles({ size: "sm" })}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    New review
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line" role="list">
            {filtered.map((review) => {
              const open = review.findings.filter(
                (finding) => finding.status === "open",
              );
              const critical = open.filter(
                (finding) => finding.severity === "critical",
              ).length;
              return (
                <li key={review.id}>
                  <Link
                    href={`/reviews/${review.id}`}
                    className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition hover:bg-ink-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:px-5 lg:grid-cols-[minmax(0,1fr)_128px_104px_112px_96px_32px]"
                  >
                    <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
                      <ScoreRing score={review.score} size={46} hideLabel strokeWidth={4.5} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-ink-900 transition group-hover:text-brand-700">
                          {review.title}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-400">
                          <span>{review.channel}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">v{review.versions[review.versions.length - 1]?.number ?? 1}</span>
                          {review.dueAt && isOverdue(review.dueAt) && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-0.5 font-medium text-rose-600">
                                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                                Overdue
                              </span>
                            </>
                          )}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 lg:hidden">
                          <StatusBadge status={review.status} />
                          {critical > 0 && (
                            <Badge className="border-rose-200 bg-rose-50 text-rose-700">
                              <AlertOctagon className="h-3 w-3" aria-hidden="true" />
                              {critical}
                            </Badge>
                          )}
                          <Badge className="border-line bg-ink-50 text-ink-500">
                            {open.length} open
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="hidden lg:block">
                      <StatusBadge status={review.status} />
                    </div>

                    <div className="hidden lg:block">
                      <p className="text-[13px] font-semibold tabular-nums text-ink-800">
                        {open.length}{" "}
                        <span className="text-[11px] font-normal text-ink-400">
                          open
                        </span>
                      </p>
                      {critical > 0 ? (
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-rose-600">
                          <span className="h-1 w-1 rounded-full bg-rose-500" />
                          {critical} critical
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[10px] text-ink-400">
                          {review.knowledgeGaps.length > 0
                            ? `${review.knowledgeGaps.length} knowledge gap`
                            : "No blockers"}
                        </p>
                      )}
                    </div>

                    <div className="hidden items-center gap-2 lg:flex">
                      <Avatar name={review.submittedBy} size="xs" />
                      <span className="truncate text-[11px] text-ink-500">
                        {review.submittedBy.split(" ")[0]}
                      </span>
                    </div>

                    <p className="hidden text-[11px] text-ink-400 lg:block">
                      {formatRelative(review.updatedAt)}
                    </p>

                    <ChevronRight
                      className="h-4 w-4 justify-self-end text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-col gap-2 border-t border-line bg-ink-50/40 px-4 py-3 text-[11px] text-ink-400 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p>
            Showing {filtered.length} {filtered.length === 1 ? "review" : "reviews"}.
            All content and policy sources are synthetic.
          </p>
          <Link
            href="/policies"
            className="inline-flex items-center gap-1 font-semibold text-brand-600 transition hover:text-brand-700"
          >
            View approved knowledge
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </Card>
    </div>
  );
}
