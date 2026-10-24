import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  info: {
    wrap: "border-brand-200 bg-brand-50/70 text-brand-900",
    icon: "text-brand-600",
    Icon: Info,
  },
  success: {
    wrap: "border-emerald-200 bg-emerald-50/75 text-emerald-950",
    icon: "text-emerald-600",
    Icon: CheckCircle2,
  },
  warning: {
    wrap: "border-amber-200 bg-amber-50/80 text-amber-950",
    icon: "text-amber-600",
    Icon: AlertTriangle,
  },
  danger: {
    wrap: "border-rose-200 bg-rose-50/80 text-rose-950",
    icon: "text-rose-600",
    Icon: ShieldAlert,
  },
} as const;

export function InlineAlert({
  variant = "info",
  title,
  children,
  action,
  className,
  icon,
}: {
  variant?: keyof typeof VARIANTS;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  const style = VARIANTS[variant];
  const Icon = style.Icon;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5 text-[13px] leading-relaxed",
        style.wrap,
        className,
      )}
      role={variant === "danger" ? "alert" : "status"}
    >
      <span className={cn("mt-0.5 shrink-0", style.icon)}>
        {icon ?? <Icon className="h-[18px] w-[18px]" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && (
          <div className={cn(title && "mt-0.5", "text-[13px] leading-relaxed opacity-90")}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
