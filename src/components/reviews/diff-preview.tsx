import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function DiffPreview({
  before,
  after,
  className,
}: {
  before: string;
  after: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-[1fr_auto_1fr]", className)}>
      <div className="min-w-0 rounded-lg border border-rose-100 bg-rose-50/80 p-2.5">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-rose-500">
          Current
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-rose-900 line-through decoration-rose-300">
          {before}
        </p>
      </div>
      <div className="hidden items-center justify-center sm:flex">
        <ArrowRight className="h-3.5 w-3.5 text-ink-300" aria-hidden="true" />
      </div>
      <div className="min-w-0 rounded-lg border border-emerald-100 bg-emerald-50/80 p-2.5">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-600">
          Proposed
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-emerald-950">
          {after || "Add a replacement…"}
        </p>
      </div>
    </div>
  );
}
