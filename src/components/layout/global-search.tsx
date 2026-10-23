"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileSearch,
  Search,
  SearchX,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ui/score-ring";
import { useReviews } from "@/components/providers/review-provider";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { reviews } = useReviews();
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return reviews.slice(0, 6);
    return reviews
      .filter((review) => {
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
      })
      .slice(0, 8);
  }, [query, reviews]);

  function goToReview(id: string) {
    setOpen(false);
    setQuery("");
    router.push(`/reviews/${id}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-full max-w-[240px] items-center gap-2 rounded-xl border border-line bg-white/80 px-3 text-left text-[12px] text-ink-400 shadow-sm transition hover:border-ink-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:flex lg:max-w-[280px]"
        aria-label="Search reviews"
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">Search reviews…</span>
        <span className="kbd" aria-hidden="true">
          ⌘K
        </span>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:hidden"
        aria-label="Search reviews"
      >
        <Search className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setQuery("");
        }}
        title="Search reviews"
        description="Find content by title, channel, creator, policy code or finding."
        size="lg"
        bodyClassName="pt-3"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && results[0]) {
                  goToReview(results[0].id);
                }
              }}
              placeholder="Try 'Glow', 'Instagram' or 'DSC-01'…"
              className="h-11 w-full rounded-xl border border-line bg-white pl-10 pr-4 text-sm text-ink-900 shadow-sm outline-none transition placeholder:text-ink-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
              aria-label="Search query"
              data-autofocus
            />
          </div>

          <div>
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">
              {query.trim() ? `${results.length} matching reviews` : "Recent reviews"}
            </p>
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-ink-50/50 px-6 py-10 text-center">
                <SearchX className="h-6 w-6 text-ink-300" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-ink-800">
                  No reviews match “{query}”
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  Try a channel, creator name or policy code such as CLM-01.
                </p>
              </div>
            ) : (
              <ul className="space-y-1">
                {results.map((review) => (
                  <li key={review.id}>
                    <button
                      type="button"
                      onClick={() => goToReview(review.id)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-transparent p-2.5 text-left transition hover:border-line hover:bg-ink-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <ScoreRing score={review.score} size={40} hideLabel strokeWidth={4.5} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[13px] font-semibold text-ink-900">
                            {review.title}
                          </p>
                          <StatusBadge status={review.status} />
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-ink-400">
                          {review.channel} · {review.submittedBy} ·{" "}
                          {formatRelative(review.updatedAt)}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-line pt-3 text-[11px] text-ink-400">
            <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Showing demo reviews from the Aurelia Skin workspace.
            </span>
            <span className={cn("ml-auto hidden items-center gap-1 sm:flex")}>
              <span className="kbd">↵</span> to open first result
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
}
