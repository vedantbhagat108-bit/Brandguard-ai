"use client";

import { useMemo, type KeyboardEvent, type ReactNode } from "react";
import { SEVERITY_META } from "@/lib/review-config";
import type { Finding, KnowledgeGap, Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

type Annotation = {
  id: string;
  start: number;
  end: number;
  kind: "finding" | "gap";
  title: string;
  severity?: Severity;
};

export function HighlightedContent({
  content,
  findings,
  gaps,
  selectedId,
  onSelect,
  showHighlights = true,
}: {
  content: string;
  findings: Finding[];
  gaps: KnowledgeGap[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showHighlights?: boolean;
}) {
  const annotations = useMemo(() => {
    if (!showHighlights) return [];
    const raw: Annotation[] = [
      ...findings
        .filter((finding) => finding.status === "open")
        .map((finding) => ({
          id: finding.id,
          start: finding.start,
          end: finding.end,
          kind: "finding" as const,
          title: finding.title,
          severity: finding.severity,
        })),
      ...gaps.map((gap) => ({
        id: gap.id,
        start: gap.start,
        end: gap.end,
        kind: "gap" as const,
        title: gap.topic,
      })),
    ]
      .filter(
        (annotation) =>
          annotation.start >= 0 &&
          annotation.end > annotation.start &&
          annotation.end <= content.length,
      )
      .sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        return a.kind === "finding" ? -1 : 1;
      });

    const accepted: Annotation[] = [];
    for (const annotation of raw) {
      const previous = accepted[accepted.length - 1];
      if (previous && annotation.start < previous.end) {
        if (annotation.kind === "gap") continue;
        accepted.push({
          ...annotation,
          start: previous.end,
          end: Math.max(previous.end, annotation.end),
        });
        continue;
      }
      accepted.push(annotation);
    }
    return accepted;
  }, [content, findings, gaps, showHighlights]);

  if (!showHighlights || annotations.length === 0) {
    return (
      <div className="content-body whitespace-pre-wrap text-ink-700">
        {content}
      </div>
    );
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;

  annotations.forEach((annotation) => {
    if (annotation.start > cursor) {
      nodes.push(
        <span key={`text-${cursor}`}>
          {content.slice(cursor, annotation.start)}
        </span>,
      );
    }

    const isGap = annotation.kind === "gap";
    const isSelected = selectedId === annotation.id;
    const meta = annotation.severity
      ? SEVERITY_META[annotation.severity]
      : null;

    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(annotation.id);
      }
    };

    nodes.push(
      <mark
        key={annotation.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(annotation.id)}
        onKeyDown={handleKeyDown}
        aria-label={`${isGap ? "Knowledge gap" : `${meta?.label ?? ""} finding`}: ${annotation.title}. Show details.`}
        aria-pressed={isSelected}
        title={`${isGap ? "Knowledge gap" : meta?.label}: ${annotation.title}`}
        className={cn(
          "cursor-pointer rounded-[3px] border-b-2 px-0.5 py-[1px] text-ink-900 decoration-2 underline-offset-[3px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1",
          isGap
            ? "border-dashed border-violet-400 bg-violet-100/80 hover:bg-violet-200/80"
            : meta?.highlight,
          isSelected &&
            (isGap
              ? "ring-2 ring-violet-500 ring-offset-2"
              : meta?.highlightSelected),
        )}
      >
        {content.slice(annotation.start, annotation.end)}
      </mark>,
    );
    cursor = annotation.end;
  });

  if (cursor < content.length) {
    nodes.push(
      <span key={`text-${cursor}`}>{content.slice(cursor)}</span>,
    );
  }

  return (
    <div className="content-body whitespace-pre-wrap text-ink-700">
      {nodes}
    </div>
  );
}

export function HighlightLegend({
  findings,
  gapCount,
}: {
  findings: Finding[];
  gapCount: number;
}) {
  const severities = Array.from(
    new Set(
      findings
        .filter((finding) => finding.status === "open")
        .map((finding) => finding.severity),
    ),
  ).sort(
    (a, b) => SEVERITY_META[a].order - SEVERITY_META[b].order,
  );

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-ink-500">
      {severities.map((severity) => {
        const meta = SEVERITY_META[severity];
        return (
          <span key={severity} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-sm", meta.dot)} />
            {meta.label}
          </span>
        );
      })}
      {gapCount > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm border border-dashed border-violet-500 bg-violet-100" />
          Knowledge gap
        </span>
      )}
      <span className="ml-auto hidden text-ink-300 sm:inline">
        Select a highlight to inspect the evidence
      </span>
    </div>
  );
}
