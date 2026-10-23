"use client";

import { useState } from "react";
import {
  Eye,
  GitBranch,
  History,
  Sparkles,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { VersionPreviewDialog } from "@/components/reviews/review-dialogs";
import { formatDateTime } from "@/lib/format";
import type { Review, ReviewVersion } from "@/lib/types";
import { cn } from "@/lib/utils";

const SOURCE_META: Record<
  ReviewVersion["source"],
  { label: string; tone: string; icon: typeof Upload }
> = {
  submission: {
    label: "Submission",
    tone: "border-line bg-ink-50 text-ink-500",
    icon: Upload,
  },
  edit: {
    label: "Reviewer edit",
    tone: "border-brand-200 bg-brand-50 text-brand-700",
    icon: GitBranch,
  },
  creator_revision: {
    label: "Creator revision",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    icon: Sparkles,
  },
  restore: {
    label: "Restored",
    tone: "border-violet-200 bg-violet-50 text-violet-700",
    icon: History,
  },
};

export function VersionHistoryCard({ review }: { review: Review }) {
  const [preview, setPreview] = useState<ReviewVersion | null>(null);
  const versions = [...review.versions].sort((a, b) => b.number - a.number);
  const currentNumber = versions[0]?.number ?? 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Version history"
        description="Every applied fix and creator revision is retained as an immutable snapshot."
        icon={
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <History className="h-4 w-4" aria-hidden="true" />
          </span>
        }
        action={
          <Badge className="border-line bg-white text-ink-500 normal-case tracking-normal">
            {versions.length} {versions.length === 1 ? "version" : "versions"}
          </Badge>
        }
      />

      <ol className="divide-y divide-line">
        {versions.map((version) => {
          const meta = SOURCE_META[version.source];
          const Icon = meta.icon;
          const isCurrent = version.number === currentNumber;
          return (
            <li
              key={version.id}
              className={cn(
                "flex items-start gap-3 px-5 py-4 sm:px-6",
                isCurrent && "bg-brand-50/25",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tabular-nums",
                  isCurrent
                    ? "bg-brand-600 text-white"
                    : "border border-line bg-white text-ink-500",
                )}
                aria-hidden="true"
              >
                v{version.number}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-[12px] font-semibold text-ink-900">
                    {version.note}
                  </p>
                  {isCurrent && (
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 normal-case tracking-normal">
                      Current
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-ink-400">
                  {version.author} · {formatDateTime(version.createdAt)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge
                    className={cn(
                      "normal-case tracking-normal",
                      meta.tone,
                    )}
                  >
                    <Icon className="h-2.5 w-2.5" aria-hidden="true" />
                    {meta.label}
                  </Badge>
                  <span className="rounded-md bg-ink-50 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
                    {version.openFindings} open at this version
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPreview(version)}
                    className="ml-auto h-7 px-2 text-[10px] text-brand-600 hover:bg-brand-50 hover:text-brand-700"
                  >
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    View snapshot
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <VersionPreviewDialog
        version={preview}
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
      />
    </Card>
  );
}
