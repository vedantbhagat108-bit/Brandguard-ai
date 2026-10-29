"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LogIn, LogOut, Menu, ShieldCheck } from "lucide-react";
import { BrandLockup } from "@/components/ui/brand";
import { Avatar } from "@/components/ui/avatar";
import { GlobalSearch } from "@/components/layout/global-search";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

function useBreadcrumbs(pathname: string) {
  if (pathname === "/") return [{ label: "Overview" }];
  if (pathname === "/reviews") return [{ label: "Review queue" }];
  if (pathname === "/lobby") return [{ label: "OTP Review Lobby" }];
  if (pathname === "/submit") return [{ label: "New review" }];
  if (pathname === "/policies") return [{ label: "Brand knowledge" }];
  if (pathname === "/visual-assets") return [{ label: "Visual assets" }];
  if (pathname === "/access") return [{ label: "Access control & BrandPIN" }];
  if (pathname === "/insights") return [{ label: "Insights" }];
  if (pathname.startsWith("/reviews/") && pathname.endsWith("/approve")) {
    return [
      { label: "Review queue", href: "/reviews" },
      { label: "Approval" },
    ];
  }
  if (pathname.startsWith("/reviews/")) {
    return [
      { label: "Review queue", href: "/reviews" },
      { label: "Review detail" },
    ];
  }
  return [{ label: "Workspace" }];
}

export function AppHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const breadcrumbs = useBreadcrumbs(pathname);
  const { user, isAuthenticated, setLoginModalOpen, setPersonalDashboardOpen, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-white/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 transition hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <Link
          href="/"
          className="lg:hidden"
          aria-label="BrandLens AI home"
        >
          <BrandLockup />
        </Link>

        <nav
          aria-label="Breadcrumb"
          className="hidden min-w-0 items-center gap-1.5 lg:flex"
        >
          <span className="text-[12px] font-medium text-ink-400">
            {isAuthenticated
              ? user.brand_name || "EcoFresh Botanicals"
              : "BrandLens AI"}
          </span>
          {breadcrumbs.map((item, index) => (
            <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              <ChevronRight className="h-3 w-3 text-ink-300" aria-hidden="true" />
              {item.href ? (
                <Link
                  href={item.href}
                  className="rounded text-[12px] font-medium text-ink-500 transition hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="truncate text-[12px] font-semibold text-ink-800"
                  aria-current="page"
                >
                  {item.label}
                </span>
              )}
            </span>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isAuthenticated && <GlobalSearch />}
          <div className="mx-1 hidden h-6 w-px bg-line sm:block" />

          {!isAuthenticated ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setLoginModalOpen(true)}
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Sign in
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPersonalDashboardOpen(true)}
                className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-ink-100 transition cursor-pointer text-left group"
                title={`${user.name} · ${user.roleLabel} (Open Personal Dashboard)`}
                aria-label="Open Personal Dashboard"
              >
                <Avatar name={user.name} size="sm" />
                <div className="hidden xl:block">
                  <p className="text-[12px] font-semibold leading-tight text-ink-900">
                    {user.name}
                  </p>
                  <p className="text-[10px] leading-tight text-ink-400 flex items-center gap-1">
                    <span>{user.role === "manager" ? "Reviewer" : "Creator"}</span>
                    {!user.isApproved && (
                      <span className="text-amber-600 font-bold">• Pending</span>
                    )}
                  </p>
                </div>
                <ShieldCheck
                  className={`hidden h-4 w-4 sm:block ${user.role === "manager" ? "text-purple-600" : "text-mint-600"}`}
                  aria-label="Authorised user"
                />
              </button>
              <button
                type="button"
                onClick={logout}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
