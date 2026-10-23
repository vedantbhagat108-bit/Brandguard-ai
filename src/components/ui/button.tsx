import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "danger-ghost"
  | "dark";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variant === "primary" &&
      "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
    variant === "secondary" &&
      "border border-line bg-white text-ink-700 shadow-sm hover:border-ink-200 hover:bg-ink-50/60 active:bg-ink-100",
    variant === "ghost" && "text-ink-600 hover:bg-ink-100/70 hover:text-ink-900",
    variant === "danger" &&
      "bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800",
    variant === "danger-ghost" &&
      "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
    variant === "dark" &&
      "bg-ink-900 text-white shadow-sm hover:bg-ink-800 active:bg-ink-950",
    size === "sm" && "h-9 px-3 text-[13px]",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-5 text-sm",
    size === "icon" && "h-10 w-10 p-0",
    className,
  );
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      loadingLabel,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={buttonStyles({ variant, size, className })}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {loadingLabel ?? children}
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);
