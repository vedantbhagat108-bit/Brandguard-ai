import type { HTMLAttributes } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Eye,
  Info,
  MessageSquareDot,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SEVERITY_META,
  STATUS_META,
} from "@/lib/review-config";
import type { ReviewStatus, Severity } from "@/lib/types";

export function Badge({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none tracking-wide",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

const SEVERITY_ICONS = {
  critical: AlertOctagon,
  high: AlertTriangle,
  medium: CircleAlert,
  low: Info,
} as const;

export function SeverityBadge({
  severity,
  className,
  withIcon = true,
}: {
  severity: Severity;
  className?: string;
  withIcon?: boolean;
}) {
  const meta = SEVERITY_META[severity];
  const Icon = SEVERITY_ICONS[severity];
  return (
    <Badge className={cn(meta.badge, className)}>
      {withIcon ? (
        <Icon className="h-3 w-3" aria-hidden="true" />
      ) : (
        <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      )}
      {meta.label}
    </Badge>
  );
}

const STATUS_ICONS = {
  in_review: Eye,
  changes_requested: MessageSquareDot,
  approved: CheckCircle2,
  rejected: XCircle,
} as const;

export function StatusBadge({
  status,
  className,
}: {
  status: ReviewStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const Icon = STATUS_ICONS[status];
  return (
    <Badge className={cn(meta.badge, className)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge
      className={cn(
        "border-mint-200 bg-mint-50 text-mint-700 normal-case tracking-normal",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-mint-500" />
      Demo data
    </Badge>
  );
}
