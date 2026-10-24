"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  UserCheck,
  UserX,
  Lock,
  Unlock,
  KeyRound,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
  CheckCircle2,
  Users,
  Flame,
  Building2,
  ScrollText,
  Plus,
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

interface AccessGrant {
  user_id: string;
  email: string;
  name?: string;
  username?: string;
  role: string;
  security_role?: "ADMIN" | "REVIEWER" | "CREATOR";
  department: string;
  status: "approved" | "pending" | "revoked";
  lobby_access?: boolean;
  requested_at: string;
  granted_by?: string;
  granted_at?: string;
}

interface BrandPinRecord {
  id: string;
  pin_code: string;
  brand_id: string;
  brand_name: string;
  is_used: boolean;
  used_by_email?: string | null;
  created_by_id?: string;
  created_by_email?: string;
  created_at: string;
  expires_at: string;
}

interface DBUserSummary {
  id: string;
  username: string;
  email: string;
  name: string;
  role: "ADMIN" | "REVIEWER" | "CREATOR";
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

interface WorkspaceRecord {
  id: string;
  name: string;
  brand_name: string;
  created_at: string;
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
  const { user, isManager, isAdmin, loginAs, setLoginModalOpen, refreshAccessStatus, requestAccess } = useAuth();
  const { toast } = useToast();

  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [pins, setPins] = useState<BrandPinRecord[]>([]);
  const [dbUsers, setDbUsers] = useState<DBUserSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>("b0000001-0000-4000-8000-000000000001");
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "revoked">("all");
  const [copiedPin, setCopiedPin] = useState<string | null>(null);
  const [testPinInput, setTestPinInput] = useState("");

  const loadSecurityData = useCallback(async () => {
    setLoading(true);
    try {
      const [grantsRes, pinsRes] = await Promise.all([
        fetch("/api/access/grants", {
          headers: { "X-User-Role": user.role, "X-User-Id": user.id },
        }),
        fetch("/api/pins", {
          headers: user.token ? { Authorization: `Bearer ${user.token}` } : {},
        }),
      ]);

      if (grantsRes.ok) {
        const grantsData = await grantsRes.json();
        setGrants(Array.isArray(grantsData) ? grantsData : []);
      }

      if (pinsRes.ok) {
        const secData = await pinsRes.json();
        setPins(Array.isArray(secData.pins) ? secData.pins : []);
        setDbUsers(Array.isArray(secData.users) ? secData.users : []);
        setAuditLogs(Array.isArray(secData.audit_logs) ? secData.audit_logs : []);
        setWorkspaces(Array.isArray(secData.workspaces) ? secData.workspaces : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user.id, user.role, user.token]);

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
            action === "approve"
              ? "Database & Lobby Access Granted"
              : action === "revoke"
              ? "Database & Lobby Access Revoked"
              : action === "grant_lobby"
              ? "OTP Lobby Rights Granted"
              : "OTP Lobby Rights Revoked",
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
          description: data.error || "Only an Admin can promote or change user roles.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  const generateNewPin = async () => {
    try {
      const res = await fetch("/api/pins/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Role": user.securityRole || user.role,
          "X-User-Id": user.id,
          ...(user.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({ brand_id: selectedBrandId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Single-Use BrandPIN Generated",
          description: `Code ${data.pin_code} issued for ${data.brand_name} (valid 7 days, single-use).`,
          variant: "success",
        });
        await loadSecurityData();
      } else {
        toast({
          title: "Failed to generate PIN",
          description: data.detail || "Only ADMIN users can generate BrandPINs.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  const handleRedeemPinDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPinInput.trim()) return;
    try {
      const res = await fetch("/api/pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin_code: testPinInput.trim().toUpperCase(),
          email: user.email,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "BrandPIN Verified & Burned",
          description: data.message,
          variant: "success",
        });
        setTestPinInput("");
        await loadSecurityData();
        await refreshAccessStatus();
      } else {
        toast({
          title: "BrandPIN Rejected",
          description: data.detail || "Invalid or already burned PIN.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  const copyPinToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedPin(code);
    setTimeout(() => setCopiedPin(null), 2000);
    toast({ title: "Copied to clipboard", description: "BrandPIN copied (Admin Creator Only).", variant: "success" });
  };

  const canSeeBrandPin = (pin: BrandPinRecord) => {
    if (!isAdmin) return false;
    const creatorId = pin.created_by_id || "";
    const creatorEmail = (pin.created_by_email || "").toLowerCase();
    const myEmail = (user.email || "").toLowerCase();
    if (creatorId || creatorEmail) {
      return creatorId === user.id || creatorEmail === myEmail;
    }
    return true;
  };

  const pendingCount = grants.filter((g) => g.status === "pending").length;
  const activePins = pins.filter((p) => !p.is_used);
  const burnedPins = pins.filter((p) => p.is_used);

  const filteredGrants = grants.filter((g) => {
    if (filterStatus === "all") return true;
    return g.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 border border-purple-200">
            <Crown className="h-3.5 w-3.5" />
            {isAdmin
              ? "Super Admin RBAC & Lobby Rights Console"
              : isManager
              ? "Manager Access & Lobby Rights Console"
              : "Creator Security & BrandPIN Portal"}
          </span>
        }
        title="Admin Role Promotion, Employee Lobby Rights, Burnable BrandPINs & Audit Ledger"
        description="Admins can promote users to Admin or Manager, and both Admins & Managers can grant or revoke OTP Review Lobby rights for employees and content creators."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {user.email.toLowerCase() !== "vedantbhagat@admin.in" && (
              <button
                onClick={async () => {
                  await loginAs("vedant_admin");
                  toast({
                    title: "Switched to Vedant Bhagat (Super Admin)",
                    description: "Authenticated as VedantBhagat@admin.in with full Admin privileges.",
                    variant: "success",
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-600 transition"
              >
                <Crown className="h-3.5 w-3.5" />
                Switch to VedantBhagat@admin.in (Admin)
              </button>
            )}
            <button
              onClick={() => setLoginModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Create Account / Forgot Password / Switch User
            </button>
            <Button size="sm" variant="secondary" onClick={loadSecurityData} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* ACCESS OVERVIEW CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <span>{user.email} · {user.securityRole || "ADMIN"}</span>
          </div>
        </Card>

        <Card className="p-4 border-line">
          <div className="flex items-center justify-between text-ink-400">
            <span className="text-xs font-semibold uppercase tracking-wider">DB Accounts (`users`)</span>
            <Users className="h-4 w-4 text-mint-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-mint-700">{dbUsers.length}</div>
          <div className="text-xs text-ink-500 mt-0.5">
            {dbUsers.filter((u) => u.role === "ADMIN").length} Admins ·{" "}
            {dbUsers.filter((u) => u.role === "REVIEWER").length} Managers ·{" "}
            {dbUsers.filter((u) => u.role === "CREATOR").length} Creators
          </div>
        </Card>

        <Card className="p-4 border-line">
          <div className="flex items-center justify-between text-ink-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Active BrandPINs</span>
            <Sparkles className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-purple-900">
            {activePins.length} <span className="text-xs font-normal text-ink-400">/ {pins.length} total</span>
          </div>
          <div className="text-xs text-ink-500 mt-0.5">
            {burnedPins.length} burned single-use PINs
          </div>
        </Card>

        <Card className="p-4 border-line">
          <div className="flex items-center justify-between text-ink-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Security Audit Events</span>
            <ScrollText className="h-4 w-4 text-brand-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-ink-950">{auditLogs.length}</div>
          <div className="text-xs text-ink-500 mt-0.5">Immutable compliance ledger</div>
        </Card>
      </div>

      {/* DATABASE USERS TABLE (ROLE PROMOTION & LOBBY RIGHTS CONTROL) */}
      <Card className="overflow-hidden border-line">
        <div className="px-6 py-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-600" />
              Database User Accounts, Admin Role Assignment & Employee Lobby Rights (`users` Table)
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              {isAdmin
                ? "As Admin (VedantBhagat@admin.in), you can promote any user to Admin or Manager, and grant or revoke OTP Lobby rights for employees/creators."
                : isManager
                ? "As a Manager, you can grant or revoke OTP Review Lobby rights for your employees and content creators."
                : "All accounts stored in the database."}
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
                          u.role === "ADMIN"
                            ? "bg-purple-100 text-purple-800"
                            : u.role === "REVIEWER"
                            ? "bg-brand-100 text-brand-800"
                            : "bg-mint-100 text-mint-800"
                        )}
                      >
                        {u.role === "REVIEWER" ? "MANAGER / REVIEWER" : u.role}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold",
                          hasLobbyAccess
                            ? "bg-mint-50 text-mint-800 border border-mint-200"
                            : "bg-rose-50 text-rose-800 border border-rose-200"
                        )}
                      >
                        {hasLobbyAccess ? "Lobby Rights: Active" : "Lobby Rights: Revoked"}
                      </span>
                    </div>
                    <div className="text-[11px] text-ink-400 mt-1">
                      Workspace: <strong className="text-ink-700">{u.brand_name}</strong> • Department: {u.department}
                      {u.password_updated_at && (
                        <span className="ml-2 text-mint-700 font-semibold">
                          • Password Reset at {new Date(u.password_updated_at).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Admin Role Assignment Controls */}
                  {isAdmin && (
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
                        title="Promote user to Admin"
                      >
                        Make Admin
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
                        title="Assign user as Manager / Reviewer"
                      >
                        Make Manager
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
                        title="Set user as Content Creator"
                      >
                        Creator
                      </button>
                    </div>
                  )}

                  {/* Manager & Admin Lobby Rights Control for Employees / Creators */}
                  {isManager && u.role !== "ADMIN" && (
                    hasLobbyAccess ? (
                      <button
                        type="button"
                        onClick={() => handleGrantAction(u.id, "revoke_lobby")}
                        className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition"
                      >
                        <Lock className="h-3 w-3" />
                        Revoke Lobby Rights
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleGrantAction(u.id, "grant_lobby")}
                        className="inline-flex items-center gap-1 rounded-xl border border-mint-200 bg-mint-50 px-2.5 py-1.5 text-[11px] font-semibold text-mint-800 hover:bg-mint-100 transition"
                      >
                        <KeyRound className="h-3 w-3" />
                        Grant Lobby Rights
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* SINGLE-USE BURNABLE BRANDPIN REGISTRY & GENERATOR */}
      <Card className="overflow-hidden border-line">
        <div className="px-6 py-4 border-b border-line bg-gradient-to-r from-purple-50/50 via-white to-brand-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
              <Flame className="h-4 w-4 text-purple-600" />
              Single-Use Burnable BrandPIN Registry (PIN Visible Only to Creator Admin)
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Each BrandPIN is cryptographically bound to a Brand Workspace and can <strong>only be seen by the Admin who created it</strong>.
            </p>
          </div>

          {isAdmin ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.brand_name || ws.name}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="primary" onClick={generateNewPin}>
                <Plus className="h-3.5 w-3.5" />
                Generate Single-Use PIN
              </Button>
            </div>
          ) : (
            <form onSubmit={handleRedeemPinDirect} className="flex items-center gap-2">
              <input
                type="password"
                placeholder="Enter BrandPIN from Admin"
                value={testPinInput}
                onChange={(e) => setTestPinInput(e.target.value.toUpperCase())}
                className="rounded-xl border border-purple-300 bg-white px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-purple-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <Button type="submit" size="sm" variant="primary">
                Burn & Verify PIN
              </Button>
            </form>
          )}
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {pins.map((pin) => {
            const showPinCode = canSeeBrandPin(pin);
            return (
              <div
                key={pin.id || pin.pin_code}
                className={cn(
                  "rounded-xl border p-4 transition flex flex-col justify-between",
                  pin.is_used
                    ? "border-line bg-ink-50/60 opacity-75"
                    : "border-purple-200 bg-purple-50/25 shadow-sm"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500 truncate">
                      {pin.brand_name}
                    </span>
                    {pin.is_used ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                        <Flame className="h-3 w-3" /> BURNED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-mint-100 px-2 py-0.5 text-[10px] font-bold text-mint-800">
                        <CheckCircle2 className="h-3 w-3" /> ACTIVE
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between">
                    {showPinCode ? (
                      <>
                        <span
                          className={cn(
                            "font-mono text-lg font-black tracking-widest",
                            pin.is_used ? "line-through text-ink-400" : "text-purple-950"
                          )}
                        >
                          {pin.pin_code}
                        </span>
                        {!pin.is_used && (
                          <button
                            type="button"
                            onClick={() => copyPinToClipboard(pin.pin_code)}
                            className="p-1.5 rounded-lg border border-purple-200 bg-white text-purple-700 hover:bg-purple-100 transition"
                            title="Copy BrandPIN (Creator Admin Only)"
                          >
                            {copiedPin === pin.pin_code ? (
                              <Check className="h-3.5 w-3.5 text-mint-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 border border-line px-2.5 py-1 text-xs font-bold text-ink-600">
                        <Lock className="h-3.5 w-3.5 text-ink-500" />
                        PIN Hidden (Creator Admin Only)
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-line/70 text-[11px] text-ink-500 space-y-0.5">
                  <div>
                    Creator: <strong className="text-ink-700 font-mono">{pin.created_by_email || "VedantBhagat@admin.in"}</strong>
                  </div>
                  {pin.is_used ? (
                    <div>
                      Burned by: <strong className="text-ink-700 font-mono">{pin.used_by_email}</strong>
                    </div>
                  ) : (
                    <div>
                      Expires: <strong className="text-ink-700">{new Date(pin.expires_at).toLocaleDateString()}</strong>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* CREATOR VIEW: PERSONAL STATUS CARD */}
      {!isManager && (
        <Card className="overflow-hidden border-line">
          <div
            className={cn(
              "px-6 py-5 border-b",
              user.isApproved
                ? "bg-mint-50/70 border-mint-200"
                : "bg-amber-50/70 border-amber-200"
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
                      : "Database Access Locked: Manager Approval or BrandPIN Required"}
                  </h3>
                  <p className="text-xs text-ink-600 mt-1 max-w-2xl leading-relaxed">
                    {user.isApproved
                      ? `Your account (${user.email}) is verified for ${user.brand_name || "EcoFresh Botanicals"}. Lobby Rights: ${user.lobbyAccess !== false ? "Active" : "Revoked by Manager"}.`
                      : `Your creator account (${user.email}) requires approval from a Brand Manager or a valid Single-Use BrandPIN above before accessing restricted guidelines.`}
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
                        description: "Your access request has been forwarded to the Manager.",
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

      {/* MANAGER & ADMIN VIEW: CREATOR ACCESS GRANTS & LOBBY RIGHTS TABLE */}
      {isManager && (
        <Card className="overflow-hidden border-line">
          <div className="px-6 py-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-600" />
                Employee & Content Creator Access + OTP Lobby Rights Registry
              </h3>
              <p className="text-xs text-ink-500 mt-0.5">
                Managers and Admins can grant or revoke both Database Access and Collaborative OTP Lobby Rights for any employee or content creator.
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-ink-100 p-1 rounded-xl text-xs">
              {(["all", "pending", "approved", "revoked"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg font-semibold transition capitalize",
                    filterStatus === status
                      ? "bg-white text-ink-950 shadow-sm"
                      : "text-ink-600 hover:text-ink-900"
                  )}
                >
                  {status}
                  {status === "pending" && pendingCount > 0 && (
                    <span className="ml-1.5 rounded-full bg-amber-500 text-white px-1.5 py-0.2 text-[9px]">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-line">
            {filteredGrants.length === 0 ? (
              <div className="p-8 text-center text-xs text-ink-400">
                No access grants match the selected filter.
              </div>
            ) : (
              filteredGrants.map((grant) => {
                const lobbyAllowed = grant.lobby_access !== false;
                return (
                  <div
                    key={grant.user_id}
                    className="px-6 py-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 hover:bg-ink-50/40 transition"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-xs",
                          grant.status === "approved"
                            ? "bg-mint-50 text-mint-700 border border-mint-200"
                            : grant.status === "pending"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        )}
                      >
                        {grant.email.slice(0, 2).toUpperCase()}
                      </span>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-ink-900">
                            {grant.name || grant.email}
                          </span>
                          <span className="text-[11px] text-ink-500 font-mono">({grant.email})</span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                              grant.status === "approved"
                                ? "bg-mint-100 text-mint-800"
                                : grant.status === "pending"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                            )}
                          >
                            DB: {grant.status}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                              lobbyAllowed
                                ? "bg-brand-100 text-brand-800"
                                : "bg-rose-100 text-rose-800"
                            )}
                          >
                            Lobby: {lobbyAllowed ? "Allowed" : "Revoked"}
                          </span>
                        </div>

                        <div className="text-[11px] text-ink-400 mt-1 flex items-center gap-2 flex-wrap">
                          <span>
                            Department: <strong className="text-ink-700">{grant.department}</strong>
                          </span>
                          <span>•</span>
                          <span>Role: {grant.security_role || grant.role}</span>
                          {grant.granted_by && (
                            <>
                              <span>•</span>
                              <span>Updated by: {grant.granted_by}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-end lg:self-center">
                      {/* Lobby Rights Toggle for Managers & Admins */}
                      {lobbyAllowed ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleGrantAction(grant.user_id, "revoke_lobby")}
                          className="text-rose-700 border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Revoke Lobby Rights
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleGrantAction(grant.user_id, "grant_lobby")}
                          className="text-mint-800 border-mint-200 bg-mint-50 hover:bg-mint-100 text-xs"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Grant Lobby Rights
                        </Button>
                      )}

                      {/* Database Access Toggle */}
                      {grant.status !== "approved" ? (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleGrantAction(grant.user_id, "approve")}
                          className="!bg-mint-600 hover:!bg-mint-500 !text-white text-xs"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Grant DB Access
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleGrantAction(grant.user_id, "revoke")}
                          className="text-rose-600 hover:bg-rose-50 text-xs"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Revoke All Access
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      )}

      {/* IMMUTABLE SECURITY AUDIT LOG LEDGER */}
      <Card className="overflow-hidden border-line">
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-brand-600" />
              Immutable Security Audit Log (`audit_logs`)
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Every login, role promotion, lobby right grant/revocation, password reset, PIN burn, and submission is recorded.
            </p>
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
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-mono font-bold uppercase shrink-0",
                    log.action.includes("ROLE") || log.action.includes("PIN")
                      ? "bg-purple-100 text-purple-800"
                      : log.action.includes("PASSWORD") || log.action.includes("LOBBY_ACCESS")
                      ? "bg-rose-100 text-rose-800"
                      : log.action.includes("OTP") || log.action.includes("LOBBY")
                      ? "bg-brand-100 text-brand-800"
                      : log.action.includes("SUBMITTED")
                      ? "bg-amber-100 text-amber-800"
                      : "bg-mint-100 text-mint-800"
                  )}
                >
                  {log.action}
                </span>
                <div>
                  <span className="font-medium text-ink-900">
                    {formatAuditDetails(log.details, isAdmin)}
                  </span>
                  <div className="text-[11px] text-ink-400 font-mono">
                    Actor: {log.user_email || "system@brandlens.ai"} • IP: {log.ip_address || "127.0.0.1"}
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
    </div>
  );
}
