import { scoreTone } from "@/lib/review-config";
import { cn } from "@/lib/utils";

export function ScoreRing({
  score,
  size = 72,
  strokeWidth = 4,
  className,
  label = "Compliance score",
  hideLabel = false,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
  hideLabel?: boolean;
}) {
  const tone = scoreTone(score);
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const fontSize = size >= 80 ? "text-2xl" : size >= 60 ? "text-lg" : "text-sm";

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${score} out of 100`}
    >
      <svg
        viewBox="0 0 48 48"
        className="absolute inset-0 h-full w-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          className="stroke-ink-100"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={cn("transition-all duration-700 ease-out", tone.ring)}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="relative flex flex-col items-center justify-center">
        <span className={cn("font-semibold tabular-nums tracking-tight text-ink-900", fontSize)}>
          {score}
        </span>
        {!hideLabel && (
          <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-ink-400">
            / 100
          </span>
        )}
      </div>
    </div>
  );
}
