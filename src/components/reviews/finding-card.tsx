"use client";

import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  PencilLine,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Badge, SeverityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DiffPreview } from "@/components/reviews/diff-preview";
import { formatRelative } from "@/lib/format";
import type { Finding } from "@/lib/types";
import { cn } from "@/lib/utils";

export function FindingCard({
  finding,
  selected,
  locked,
  onSelect,
  onAccept,
  onEdit,
  onDismiss,
}: {
  finding: Finding;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
  onAccept: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}) {
  const isOpen = finding.status === "open";
  const resolutionLabel =
    finding.status === "accepted"
      ? "Fix applied"
      : finding.status === "edited"
        ? "Custom edit applied"
        : "Dismissed";

  return (
    <article
      id={`finding-${finding.id}`}
      className={cn(
        "scroll-mt-24 rounded-xl border bg-white p-3.5 shadow-sm transition sm:p-4",
        selected
          ? "border-brand-300 ring-2 ring-brand-100"
          : "border-line hover:border-ink-200",
        !isOpen && "bg-ink-50/30",
      )}
      aria-labelledby={`finding-title-${finding.id}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={finding.severity} />
        <Badge className="border-line bg-ink-50 font-mono text-[10px] tracking-normal text-ink-500">
          {finding.ruleCode}
        </Badge>
        <Badge className="border-line bg-white text-ink-400 normal-case tracking-normal">
          {finding.category}
        </Badge>
        {!isOpen && (
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 normal-case tracking-normal">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            {resolutionLabel}
          </Badge>
        )}
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="mt-2 block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-pressed={selected}
      >
        <h3
          id={`finding-title-${finding.id}`}
          className="text-[13px] font-semibold leading-snug text-ink-900 sm:text-sm"
        >
          {finding.title}
        </h3>
        <p className="mt-2 border-l-2 border-ink-200 pl-2.5 text-[11px] leading-relaxed text-ink-500">
          “{finding.evidence}”
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
          {finding.explanation}
        </p>
      </button>

      <div className="mt-3 rounded-lg border border-line bg-ink-50/50 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400">
            <Sparkles className="h-3 w-3 text-brand-500" aria-hidden="true" />
            Suggested fix
          </p>
          <span className="text-[9px] font-medium text-ink-400">
            {Math.round(finding.confidence * 100)}% confidence
          </span>
        </div>
        <DiffPreview
          before={finding.evidence}
          after={finding.suggestedFix}
          className="mt-2"
        />
      </div>

      <details className="group mt-2.5 rounded-lg border border-line bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-semibold text-ink-500 transition hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {finding.source.title}{" "}
            <span className="font-normal text-ink-400">
              · {finding.source.section}
            </span>
          </span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-ink-300 transition group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-line px-2.5 py-2.5">
          <p className="text-[10px] leading-relaxed text-ink-500">
            “{finding.source.quote}”
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[9px] text-ink-400">
            <ShieldCheck className="h-3 w-3 text-mint-600" aria-hidden="true" />
            Approved v{finding.source.version} · {finding.source.approvedBy} ·{" "}
            {formatRelative(finding.source.updatedAt)}
          </p>
        </div>
      </details>

      {isOpen && !locked ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Button size="sm" onClick={onAccept} className="h-8 px-2.5 text-[11px]">
            Accept fix
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onEdit}
            className="h-8 px-2.5 text-[11px]"
          >
            <PencilLine className="h-3 w-3" aria-hidden="true" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            className="h-8 px-2 text-[11px] text-ink-400 hover:text-ink-700"
          >
            <XCircle className="h-3 w-3" aria-hidden="true" />
            Dismiss
          </Button>
        </div>
      ) : !isOpen && finding.resolution ? (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-ink-50 px-2.5 py-2 text-[10px] leading-relaxed text-ink-500">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            {resolutionLabel} by {finding.resolution.by} ·{" "}
            {formatRelative(finding.resolution.at)}
            {finding.resolution.note ? ` — ${finding.resolution.note}` : ""}
          </span>
        </div>
      ) : locked && isOpen ? (
        <p className="mt-2.5 flex items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-2 text-[10px] text-ink-400">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          Findings are locked after a final decision.
        </p>
      ) : null}
    </article>
  );
}
