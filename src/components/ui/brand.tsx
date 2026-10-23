import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[13px] bg-gradient-to-br from-brand-500 via-brand-600 to-ink-900 text-white shadow-sm ring-1 ring-inset ring-white/15",
        className,
      )}
      aria-hidden="true"
    >
      <span className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-mint-300/40 blur-[7px]" />
      <svg viewBox="0 0 24 24" fill="none" className="relative h-[21px] w-[21px]">
        <circle
          cx="10.5"
          cy="10.5"
          r="5.6"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M14.9 14.9L19 19"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          d="M8.1 10.5a2.4 2.4 0 0 1 2.4-2.4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          className="text-mint-200"
        />
        <path
          d="M17.2 4.2l.35.9.9.35-.9.35-.35.9-.35-.9-.9-.35.9-.35.35-.9z"
          fill="currentColor"
          className="text-mint-200"
        />
      </svg>
    </span>
  );
}

export function BrandLockup({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-[15px] font-semibold tracking-tight",
              dark ? "text-white" : "text-ink-900",
            )}
          >
            BrandLens
          </span>
          <span className="rounded-md bg-mint-300/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-950">
            AI
          </span>
        </div>
        <p
          className={cn(
            "text-[10px] font-medium uppercase tracking-[0.14em]",
            dark ? "text-white/45" : "text-ink-400",
          )}
        >
          Brand governance
        </p>
      </div>
    </div>
  );
}
