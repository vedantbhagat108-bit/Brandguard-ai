"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  Users,
  Building2,
  ScrollText,
  UserPlus,
  RotateCcw,
  Crown,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/providers/toast-provider";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DBUserSummary {
  id: string;
  username: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "REVIEWER" | "CREATOR";
  brand_id: string;
  brand_name: string;
  department: string;
  is_approved: boolean;
  lobby_access?: boolean;
  created_at: string;
  password_updated_at?: string | null;
}

interface AuditLogEntry {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  details: string | Record<string, any>;
  ip_address: string;
  timestamp: string;
}

function formatAuditDetails(
  details: string | Record<string, any> | undefined | null,
  canViewSecrets: boolean
): string {
  if (!details) return "";
  let raw = "";
  if (typeof details === "string") {
    raw = details;
  } else if (typeof details === "object") {
    raw = Object.entries(details)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => {
        if (!canViewSecrets && (k === "pin_code" || k === "room_code")) {
          return `${k}: ••••••••`;
        }
        return `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
      })
      .join(" · ");
  } else {
    raw = String(details);
  }
  if (!canViewSecrets) {
    raw = raw
      .replace(/pin_code:\s*[A-Za-z0-9-]+/gi, "pin_code: ••••••••")
      .replace(/room_code:\s*[A-Za-z0-9-]+/gi, "room_code: ••••••");
  }
  return raw;
}

export default function AccessManagementPage() {
  const {
    user,
    isAuthenticated,
    isManager,
    isAdmin,
    isSuperAdmin,
    setLoginModalOpen,
    refreshAccessStatus,
    requestAccess,
  } = useAuth();
  const { toast } = useToast();

  const [dbUsers, setDbUsers] = useState<DBUserSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuditLogs, setShowAuditLogs] = useState(false);

  const loadSecurityData = useCallback(async () => {
    setLoading(true);
    try {
      const pinsRes = await fetch("/api/pins", {
        headers: user.token ? { Authorization: `Bearer ${user.token}` } : {},
      });

      if (pinsRes.ok) {
        const secData = await pinsRes.json();
        setDbUsers(Array.isArray(secData.users) ? secData.users : []);
        setAuditLogs(Array.isArray(secData.audit_logs) ? secData.audit_logs : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user.token]);

  useEffect(() => {
    loadSecurityData();
    if (!isManager) {
      refreshAccessStatus();
    }
  }, [isManager, loadSecurityData, refreshAccessStatus]);

  const handleGrantAction = async (
    targetUserId: string,
    action: "approve" | "revoke" | "grant_lobby" | "revoke_lobby"
  ) => {
    try {
      const res = await fetch("/api/access/grant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Role": "manager",
          "X-Security-Role": user.securityRole || "ADMIN",
          "X-User-Id": user.id,
        },
        body: JSON.stringify({
          target_user_id: targetUserId,
          action,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast({
          title:
            action === "grant_lobby"
              ? "Lobby Permission Granted"
              : action === "revoke_lobby"
              ? "Lobby Permission Revoked"
              : action === "approve"
              ? "Workspace Access Granted"
              : "Workspace Access Revoked",
          description: data.message || `Updated permissions for ${targetUserId}.`,
          variant: action.includes("revoke") ? "info" : "success",
        });
        await loadSecurityData();
      } else {
        toast({ title: "Action failed", description: data.error, variant: "error" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  const handleUpdateUserRole = async (
    targetUserId: string,
    newRole: "ADMIN" | "REVIEWER" | "CREATOR"
  ) => {
    try {
      const res = await fetch("/api/access/grant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Role": "manager",
          "X-Security-Role": user.securityRole || "ADMIN",
          "X-User-Id": user.id,
        },
        body: JSON.stringify({
          target_user_id: targetUserId,
          action: "update_role",
          new_role: newRole,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: `Role Updated to ${newRole}`,
          description: data.message,
          variant: "success",
        });
        await loadSecurityData();
      } else {
        toast({
          title: "Role Update Denied",
          description: data.error || "Only an Admin can change user roles.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-xl font-semibold text-ink-950">
            Sign in to Manage Roles &amp; Permissions
          </h1>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-500">
            Sign in to your account or register a new workspace user to manage roles and lobby permissions.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" size="md" onClick={() => setLoginModalOpen(true)}>
              Sign in / Create Account
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 border border-purple-200">
            <Crown className="h-3.5 w-3.5" />
            {isSuperAdmin
              ? "Super Admin RBAC & Lobby Permissions"
              : isAdmin
              ? "Workspace Admin Access Console"
              : "Workspace Access & Permissions"}
          </span>
        }
        title="User Roles & Lobby Permissions"
        description="Manage workspace roles and grant or revoke Lobby permissions cleanly in one place."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setLoginModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add / Switch Account
            </button>
            <Button size="sm" variant="secondary" onClick={loadSecurityData} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* OVERVIEW CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-line">
          <div className="flex items-center justify-between text-ink-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Identity</span>
            <ShieldCheck className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-2 text-lg font-bold text-ink-950 truncate">
            {user.name}{" "}
            {user.username && (
              <span className="text-xs font-mono text-brand-600">(@{user.username})</span>
            )}
          </div>
          <div className="text-xs text-ink-500 mt-0.5 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-brand-600" />
            <span>
              {user.email} · {isSuperAdmin ? "SUPER ADMIN" : user.securityRole || "CREATOR"}
            </span>
          </div>
        </Card>

        <Card className="p-4 border-line">
          <div className="flex items-center justify-between text-ink-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Workspace Accounts</span>
            <Users className="h-4 w-4 text-mint-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-mint-700">{dbUsers.length}</div>
          <div className="text-xs text-ink-500 mt-0.5">
            {dbUsers.filter((u) => u.role === "ADMIN").length} Admins ·{" "}
            {dbUsers.filter((u) => u.role === "REVIEWER").length} Managers ·{" "}
            {dbUsers.filter((u) => u.role === "CREATOR").length} Creators
          </div>
        </Card>

        <Card className="p-4 border-line flex flex-col justify-between">
          <div className="flex items-center justify-between text-ink-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Security Audit Ledger</span>
            <ScrollText className="h-4 w-4 text-brand-600" />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xl font-bold text-ink-950">{auditLogs.length} events</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowAuditLogs((prev) => !prev)}
            >
              {showAuditLogs ? "Hide Audit Logs" : "Show Audit Logs"}
            </Button>
          </div>
        </Card>
      </div>

      {/* USERS & PERMISSIONS TABLE */}
      <Card className="overflow-hidden border-line">
        <div className="px-6 py-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-600" />
              User Accounts, Roles &amp; Lobby Permissions
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              {isSuperAdmin
                ? "Super Admin can promote roles and grant or revoke Lobby permissions for any person."
                : isAdmin
                ? "Grant or revoke Lobby permissions for creators and managers in your workspace."
                : "Registered workspace members and their Lobby permission status."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLoginModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Add User / Reset Password
          </button>
        </div>

        <div className="divide-y divide-line">
          {dbUsers.map((u) => {
            const hasLobbyAccess = u.lobby_access !== false;
            const targetIsSuperAdmin = u.role === "SUPER_ADMIN";

            return (
              <div
                key={u.id}
                className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs hover:bg-ink-50/40"
              >
                <div className="flex items-start sm:items-center gap-3">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold",
                      u.role === "ADMIN"
                        ? "bg-purple-100 text-purple-800 border border-purple-200"
                        : u.role === "REVIEWER"
                        ? "bg-brand-100 text-brand-800 border border-brand-200"
                        : "bg-ink-100 text-ink-800"
                    )}
                  >
                    {(u.name || u.username).slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-ink-900">{u.name}</span>
                      <span className="rounded bg-brand-50 border border-brand-200 px-1.5 py-0.5 font-mono text-[11px] font-bold text-brand-700">
                        @{u.username}
                      </span>
                      <span className="text-ink-500 font-mono">({u.email})</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                          targetIsSuperAdmin
                            ? "bg-purple-700 text-white"
                            : u.role === "ADMIN"
                            ? "bg-purple-100 text-purple-800"
                            : u.role === "REVIEWER"
                            ? "bg-brand-100 text-brand-800"
                            : "bg-mint-100 text-mint-800"
                        )}
                      >
                        {targetIsSuperAdmin
                          ? "SUPER ADMIN"
                          : u.role === "REVIEWER"
                          ? "MANAGER"
                          : u.role}
                      </span>
                      {!targetIsSuperAdmin && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold",
                            hasLobbyAccess
                              ? "bg-mint-50 text-mint-800 border border-mint-200"
                              : "bg-rose-50 text-rose-800 border border-rose-200"
                          )}
                        >
                          {hasLobbyAccess ? "Lobby Permission: Granted" : "Lobby Permission: Revoked"}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-400 mt-1">
                      Workspace: <strong className="text-ink-700">{u.brand_name}</strong> • Department: {u.department}
                    </div>
                  </div>
                </div>

                {!targetIsSuperAdmin && (
                  <div className="flex flex-wrap items-center gap-2">
                    {isSuperAdmin && (
                      <div className="flex items-center gap-1 rounded-xl bg-ink-100 p-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateUserRole(u.id, "ADMIN")}
                          disabled={u.role === "ADMIN"}
                          className={cn(
                            "rounded-lg px-2 py-1 text-[10px] font-bold transition",
                            u.role === "ADMIN"
                              ? "bg-purple-600 text-white shadow-sm"
                              : "text-ink-600 hover:bg-white hover:text-purple-700"
                          )}
                        >
                          Admin
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateUserRole(u.id, "REVIEWER")}
                          disabled={u.role === "REVIEWER"}
                          className={cn(
                            "rounded-lg px-2 py-1 text-[10px] font-bold transition",
                            u.role === "REVIEWER"
                              ? "bg-brand-600 text-white shadow-sm"
                              : "text-ink-600 hover:bg-white hover:text-brand-700"
                          )}
                        >
                          Manager
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateUserRole(u.id, "CREATOR")}
                          disabled={u.role === "CREATOR"}
                          className={cn(
                            "rounded-lg px-2 py-1 text-[10px] font-bold transition",
                            u.role === "CREATOR"
                              ? "bg-mint-600 text-white shadow-sm"
                              : "text-ink-600 hover:bg-white hover:text-mint-700"
                          )}
                        >
                          Creator
                        </button>
                      </div>
                    )}

                    {(isSuperAdmin || (isManager && u.role !== "ADMIN")) && (
                      hasLobbyAccess ? (
                        <button
                          type="button"
                          onClick={() => handleGrantAction(u.id, "revoke_lobby")}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition"
                        >
                          <Lock className="h-3 w-3" />
                          Revoke Lobby Permission
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleGrantAction(u.id, "grant_lobby")}
                          className="inline-flex items-center gap-1 rounded-xl border border-mint-200 bg-mint-50 px-2.5 py-1.5 text-[11px] font-semibold text-mint-800 hover:bg-mint-100 transition"
                        >
                          <KeyRound className="h-3 w-3" />
                          Grant Lobby Permission
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* CREATOR PERSONAL STATUS CARD */}
      {!isManager && (
        <Card className="overflow-hidden border-line">
          <div
            className={cn(
              "px-6 py-5",
              user.isApproved ? "bg-mint-50/70" : "bg-amber-50/70"
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    user.isApproved
                      ? "bg-mint-100 text-mint-800"
                      : "bg-amber-100 text-amber-800"
                  )}
                >
                  {user.isApproved ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-ink-900">
                    {user.isApproved
                      ? "Workspace Access Authorized"
                      : "Workspace Access Pending Approval"}
                  </h3>
                  <p className="text-xs text-ink-600 mt-1 max-w-2xl leading-relaxed">
                    {user.isApproved
                      ? `Your account (${user.email}) is active. Lobby Permission: ${
                          user.lobbyAccess !== false ? "Granted" : "Revoked"
                        }.`
                      : `Your creator account (${user.email}) is awaiting approval.`}
                  </p>
                </div>
              </div>

              <div>
                {!user.isApproved ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      await requestAccess();
                      toast({
                        title: "Request submitted",
                        description: "Your access request has been forwarded.",
                        variant: "success",
                      });
                    }}
                  >
                    Submit Access Request
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-100 px-3 py-1 text-xs font-bold text-mint-800">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Clearance Active
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ON-DEMAND AUDIT LOG LEDGER */}
      {showAuditLogs && (
        <Card className="overflow-hidden border-line">
          <div className="px-6 py-4 border-b border-line flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-brand-600" />
                Immutable Security Audit Log (`audit_logs`)
              </h3>
            </div>
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[10px] font-mono font-semibold text-ink-700">
              {auditLogs.length} entries
            </span>
          </div>

          <div className="divide-y divide-line max-h-96 overflow-y-auto">
            {auditLogs.map((log, idx) => (
              <div
                key={log.id || `audit-${idx}`}
                className="px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-ink-50/50"
              >
                <div className="flex items-start sm:items-center gap-3">
                  <span className="rounded-md px-2 py-0.5 text-[10px] font-mono font-bold uppercase shrink-0 bg-brand-100 text-brand-800">
                    {log.action}
                  </span>
                  <div>
                    <span className="font-medium text-ink-900">
                      {formatAuditDetails(log.details, isSuperAdmin)}
                    </span>
                    <div className="text-[11px] text-ink-400 font-mono">
                      Actor: {log.user_email || "system@brandlens.ai"}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-ink-400 shrink-0">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
