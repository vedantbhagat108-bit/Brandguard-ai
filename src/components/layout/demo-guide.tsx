"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Compass,
  Sparkles,
} from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    title: "Open the launch review",
    description:
      "Glow Renewal Serum has seven evidence-linked findings, including two critical blockers and one knowledge gap.",
  },
  {
    title: "Inspect a finding",
    description:
      "Select a highlight in the draft to see the rule, cited source, explanation and an editable suggested fix.",
  },
  {
    title: "Take an action",
    description:
      "Accept a fix, write your own edit, dismiss a false positive, or request changes with a reviewer comment.",
  },
  {
    title: "Approve with a human decision",
    description:
      "Resolve the critical items, open the approval screen, complete the checklist and record your sign-off.",
  },
];

export function DemoGuideContent({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-brand-100 bg-brand-50/70 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-ink-900">
              A complete walkthrough, no backend required
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Everything is synthetic demo data. The policy engine runs locally
              and state is saved in this browser. Reset it anytime from the
              sidebar.
            </p>
          </div>
        </div>
      </div>

      <ol className="space-y-1.5">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex gap-3 rounded-xl p-2.5 transition hover:bg-ink-50/70"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-white text-[11px] font-bold text-ink-500 shadow-sm">
              {index + 1}
            </span>
            <div className="pt-0.5">
              <p className="text-[13px] font-semibold text-ink-900">
                {step.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex items-start gap-2.5 rounded-xl border border-line bg-ink-50/70 p-3.5">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint-600" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-ink-500">
          <span className="font-semibold text-ink-700">A note on scope:</span>{" "}
          findings are advisory. A human reviewer always makes the final call;
          this demo does not publish content or replace legal review.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Link
          href="/reviews/rev_glow_launch"
          onClick={onClose}
          className={buttonStyles({ variant: "primary" })}
        >
          Open the demo review
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export function DemoGuideDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Demo walkthrough"
      description="Four steps from a risky draft to a recorded human decision."
      size="md"
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Compass className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      }
    >
      <DemoGuideContent onClose={onClose} />
    </Modal>
  );
}

export function DemoGuideTrigger({
  variant = "secondary",
  size = "sm",
  label = "How to demo",
  showIcon = true,
  iconOnly = false,
  className,
}: {
  variant?: "primary" | "secondary" | "ghost" | "dark" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  label?: string;
  showIcon?: boolean;
  iconOnly?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={iconOnly ? "icon" : size}
        onClick={() => setOpen(true)}
        className={cn(className)}
        aria-label={iconOnly ? "Open demo walkthrough" : undefined}
      >
        {showIcon &&
          (iconOnly ? (
            <CircleHelp className="h-[18px] w-[18px]" aria-hidden="true" />
          ) : (
            <Compass className="h-4 w-4" aria-hidden="true" />
          ))}
        {!iconOnly && label}
      </Button>
      <DemoGuideDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
