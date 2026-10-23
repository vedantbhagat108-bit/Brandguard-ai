"use client";

import {
  BookOpenCheck,
  Crosshair,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { KnowledgeGap } from "@/lib/types";
import { cn } from "@/lib/utils";

export function KnowledgeGapCard({
  gap,
  selected,
  onSelect,
  onLocate,
}: {
  gap: KnowledgeGap;
  selected: boolean;
  onSelect: () => void;
  onLocate: () => void;
}) {
  return (
    <article
      id={`gap-${gap.id}`}
      className={cn(
        "scroll-mt-24 rounded-xl border p-3.5 transition",
        selected
          ? "border-violet-300 bg-violet-50/60 ring-2 ring-violet-100"
          : "border-violet-100 bg-violet-50/30 hover:border-violet-200",
      )}
      aria-labelledby={`gap-title-${gap.id}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className="border-violet-200 bg-violet-100/80 text-violet-800 normal-case tracking-normal">
          <BookOpenCheck className="h-3 w-3" aria-hidden="true" />
          Knowledge gap
        </Badge>
        <span className="text-[9px] font-medium text-violet-500">
          {Math.round(gap.confidence * 100)}% confidence
        </span>
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="mt-2 block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <h3
          id={`gap-title-${gap.id}`}
          className="text-[12px] font-semibold leading-snug text-violet-950"
        >
          {gap.topic}
        </h3>
        <p className="mt-1.5 border-l-2 border-violet-200 pl-2.5 text-[11px] italic leading-relaxed text-violet-800/80">
          “{gap.evidence}”
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-violet-900/70">
          {gap.explanation}
        </p>
      </button>
      <div className="mt-2.5 rounded-lg border border-violet-100 bg-white/70 p-2.5">
        <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-violet-500">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          Human next step
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-violet-900/75">
          {gap.recommendation}
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onLocate}
        className="mt-1.5 h-7 px-2 text-[10px] text-violet-600 hover:bg-violet-100/70 hover:text-violet-800"
      >
        <Crosshair className="h-3 w-3" aria-hidden="true" />
        Locate in draft
      </Button>
    </article>
  );
}
