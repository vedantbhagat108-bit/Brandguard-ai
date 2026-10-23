import { initials as getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";

const PALETTES = [
  "bg-brand-100 text-brand-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
];

function paletteFor(name: string) {
  const sum = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return PALETTES[sum % PALETTES.length];
}

const SIZES = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

export function Avatar({
  name,
  size = "md",
  className,
  tone = "auto",
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
  tone?: "auto" | "light" | "dark";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        tone === "light" && "bg-white/10 text-white ring-1 ring-inset ring-white/15",
        tone === "dark" && "bg-ink-900 text-white",
        tone === "auto" && paletteFor(name),
        SIZES[size],
        className,
      )}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  );
}
