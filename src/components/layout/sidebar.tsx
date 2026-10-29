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
  Lock,
  KeyRound,
  Image as ImageIcon,
  LogIn,
  LogOut,
} from "lucide-react";
import { BrandLockup } from "@/components/ui/brand";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useReviews } from "@/components/providers/review-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { LoginModal } from "@/components/layout/login-modal";
import { reviewOpenCount } from "@/lib/review-config";
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
  const { user, isAuthenticated, setLoginModalOpen, logout } = useAuth();
  const { toast } = useToast();
  const [resetOpen, setResetOpen] = useState(false);
  const openReviews = reviewOpenCount(reviews);

  const isReviewsActive =
    pathname === "/reviews" || pathname.startsWith("/reviews/");
  const isOverview = pathname === "/";

  return (
    <div className="flex h-full min-h-screen flex-col bg-ink-950 text-white">
      <div className="px-5 pb-4 pt-5">
        <Link
          href="/"
          onClick={onNavigate}
          className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
          aria-label="BrandLens AI home"
        >
          <BrandLockup dark />
        </Link>
      </div>

      {isAuthenticated && (
        <div className="px-4">
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-mint-200 to-mint-400 text-[11px] font-bold text-ink-950">
              {(user.brand_name || "EcoFresh")
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-white">
                {user.brand_name || "EcoFresh Botanicals"}
              </p>
              <p className="truncate text-[10px] font-medium text-white/40">
                Active workspace
              </p>
            </div>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mint-400" title="Active workspace" />
          </div>

          <Link
            href="/submit"
            onClick={onNavigate}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-300"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New review
          </Link>
        </div>
      )}

      <nav
        className="mt-5 flex-1 space-y-6 px-4"
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
              badge={isAuthenticated && !loading ? openReviews : undefined}
              active={isReviewsActive}
              onNavigate={onNavigate}
            />
            <NavItem
              href="/lobby"
              label="OTP Review Lobby"
              icon={KeyRound}
              active={pathname === "/lobby"}
              onNavigate={onNavigate}
            />
          </div>
        </div>

        <div>
          <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">
            Governance & Security
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
              href="/visual-assets"
              label="Visual assets"
              icon={ImageIcon}
              active={pathname === "/visual-assets"}
              onNavigate={onNavigate}
            />
            <NavItem
              href="/access"
              label="Access & BrandPIN"
              icon={Lock}
              active={pathname === "/access"}
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

      <div className="mt-6 space-y-2 px-4 pb-5">
        {!isAuthenticated ? (
          <button
            type="button"
            onClick={() => setLoginModalOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-mint-400/15 border border-mint-400/30 px-4 py-2.5 text-xs font-semibold text-mint-200 transition hover:bg-mint-400/25 cursor-pointer"
          >
            <LogIn className="h-4 w-4" />
            Sign in to Workspace
          </button>
        ) : (
          <div className="flex items-center gap-2 border-t border-white/[0.07] pt-3">
            <button
              type="button"
              onClick={() => setLoginModalOpen(true)}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left transition hover:opacity-90 group cursor-pointer"
              title="Click to switch account"
            >
              <Avatar name={user.name} size="sm" tone="light" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-white group-hover:text-mint-300 transition">
                  {user.name}
                </p>
                <p className="truncate text-[10px] text-white/40">
                  {user.roleLabel}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={logout}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <LoginModal />
    </div>
  );
}
