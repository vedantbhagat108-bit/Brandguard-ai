"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartNoAxesColumnIncreasing,
  Inbox,
  LayoutDashboard,
  BookOpen,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BrandLockup } from "@/components/ui/brand";
import { Avatar } from "@/components/ui/avatar";
import { DemoGuideTrigger } from "@/components/layout/demo-guide";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useReviews } from "@/components/providers/review-provider";
import { useToast } from "@/components/providers/toast-provider";
import { DEMO_USER, reviewOpenCount } from "@/lib/review-config";
import { cn } from "@/lib/utils";
import { useState } from "react";

function NavItem({
  href,
  label,
  icon: Icon,
  badge,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition",
        active
          ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
          : "text-white/55 hover:bg-white/[0.045] hover:text-white/90",
      )}
    >
      {active && (
        <span
          className="absolute -left-4 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-mint-300"
          aria-hidden="true"
        />
      )}
      <Icon
        className={cn(
          "h-[17px] w-[17px] shrink-0 transition",
          active ? "text-mint-300" : "text-white/40 group-hover:text-white/70",
        )}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span
          className={cn(
            "ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-md px-1.5 text-[10px] font-semibold tabular-nums",
            active
              ? "bg-mint-300/15 text-mint-200"
              : "bg-white/[0.07] text-white/50",
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { reviews, loading, resetDemo } = useReviews();
  const { toast } = useToast();
  const [resetOpen, setResetOpen] = useState(false);
  const openReviews = reviewOpenCount(reviews);

  const isReviewsActive =
    pathname === "/reviews" || pathname.startsWith("/reviews/");
  const isOverview = pathname === "/";

  return (
    <div className="flex h-full min-h-screen flex-col bg-ink-950 text-white">
      <div className="px-5 pb-5 pt-5">
        <Link
          href="/"
          onClick={onNavigate}
          className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
          aria-label="BrandLens AI home"
        >
          <BrandLockup dark />
        </Link>
      </div>

      <div className="px-4">
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-mint-200 to-mint-400 text-[11px] font-bold text-ink-950">
            AS
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">
              Aurelia Skin
            </p>
            <p className="truncate text-[10px] font-medium text-white/35">
              Synthetic demo workspace
            </p>
          </div>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mint-400" title="Demo workspace" />
        </div>

        <Link
          href="/submit"
          onClick={onNavigate}
          className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-[13px] font-semibold text-white shadow-lg shadow-brand-950/30 transition hover:bg-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New review
        </Link>
      </div>

      <nav
        className="mt-6 flex-1 space-y-6 px-4"
        aria-label="Primary navigation"
      >
        <div>
          <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">
            Workspace
          </p>
          <div className="space-y-1">
            <NavItem
              href="/"
              label="Overview"
              icon={LayoutDashboard}
              active={isOverview}
              onNavigate={onNavigate}
            />
            <NavItem
              href="/reviews"
              label="Review queue"
              icon={Inbox}
              badge={loading ? undefined : openReviews}
              active={isReviewsActive}
              onNavigate={onNavigate}
            />
          </div>
        </div>

        <div>
          <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">
            Governance
          </p>
          <div className="space-y-1">
            <NavItem
              href="/policies"
              label="Brand knowledge"
              icon={BookOpen}
              active={pathname === "/policies"}
              onNavigate={onNavigate}
            />
            <NavItem
              href="/insights"
              label="Insights"
              icon={ChartNoAxesColumnIncreasing}
              active={pathname === "/insights"}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      </nav>

      <div className="mt-6 space-y-3 px-4 pb-4">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-mint-300/10 text-mint-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <p className="text-[11px] font-semibold text-white/80">
              Local demo engine
            </p>
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-mint-400" />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-white/35">
            Synthetic data, saved in this browser. No API key or backend
            required.
          </p>
          <DemoGuideTrigger
            variant="ghost"
            size="sm"
            label="See the demo script"
            className="mt-2 h-auto !px-0 py-1 text-[11px] text-white/55 hover:bg-transparent hover:text-mint-200"
          />
        </div>

        <button
          type="button"
          onClick={() => setResetOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[11px] font-medium text-white/35 transition hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-300"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset demo data
        </button>

        <div className="flex items-center gap-3 border-t border-white/[0.07] pt-4">
          <Avatar name={DEMO_USER.name} size="sm" tone="light" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-white">
              {DEMO_USER.name}
            </p>
            <p className="truncate text-[10px] text-white/35">
              {DEMO_USER.role}
            </p>
          </div>
          <ShieldCheck
            className="h-4 w-4 text-white/25"
            aria-label="Authorised reviewer"
          />
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={async () => {
          await resetDemo();
          toast({
            title: "Demo data reset",
            description:
              "The six seeded reviews and their workflow history are back to the original state.",
            variant: "success",
          });
        }}
        title="Reset the demo workspace?"
        description="Any fixes, comments or approvals you made will be removed. The six sample reviews will return to their original state."
        confirmLabel="Reset demo data"
        variant="danger"
        icon={
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <RotateCcw className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        }
      >
        <div className="flex items-center justify-between rounded-xl border border-line bg-ink-50/60 px-3.5 py-3 text-[13px]">
          <div>
            <p className="font-medium text-ink-800">Aurelia Skin demo workspace</p>
            <p className="mt-0.5 text-xs text-ink-400">
              {reviews.length} reviews · entirely synthetic
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-mint-700 ring-1 ring-inset ring-mint-200">
            <span className="h-1 w-1 rounded-full bg-mint-500" />
            Local only
          </span>
        </div>
      </ConfirmDialog>
    </div>
  );
}
