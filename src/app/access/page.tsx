"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  ArrowUpRight,
  Clock,
  Check,
  X,
  User,
  Copy,
  Sparkles,
  Ticket,
  Send,
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
  requested_role?: "ADMIN" | "REVIEWER" | "CREATOR" | null;
  role_request_status?: "pending" | "approved" | "rejected" | null;
  role_request_note?: string | null;
  role_request_at?: string | null;
  created_at: string;
  password_updated_at?: string | null;
}

interface BrandPinSummary {
  id: string;
  brand_id: string;
  brand_name: string;
  pin_code: string;
  created_by_email: string;
  created_at: string;
  expires_at: string;
  is_used: boolean;
  used_by_email?: string | null;
  used_at?: string | null;
}

interface WorkspaceSummary {
  id: string;
  name: string;
  brand_name?: string;
  created_at?: string;
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
    setPersonalDashboardOpen,
    refreshAccessStatus,
    requestAccess,
  } = useAuth();
  const { toast } = useToast();

  const [dbUsers, setDbUsers] = useState<DBUserSummary[]>([]);
  const [pins, setPins] = useState<BrandPinSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuditLogs, setShowAuditLogs] = useState(false);

  // BrandPIN Clearance states
  const [redeemPinInput, setRedeemPinInput] = useState("");
  const [redeemingPin, setRedeemingPin] = useState(false);
  const [generatingPin, setGeneratingPin] = useState(false);
  const [newPinPrefix, setNewPinPrefix] = useState("PIN");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [copiedPin, setCopiedPin] = useState<string | null>(null);
  const isMutatingRef = useRef(false);

  const loadSecurityData = useCallback(async (silent = false, force = false) => {
    if (silent && !force && isMutatingRef.current) return;
    if (!silent) setLoading(true);
    try {
      const pinsRes = await fetch("/api/pins", {
        headers: user.token ? { Authorization: `Bearer ${user.token}` } : {},
        cache: "no-store",
      });

      if (pinsRes.ok) {
        const secData = await pinsRes.json();
        const incomingUsers = Array.isArray(secData.users) ? secData.users : [];
        const incomingLogs = Array.isArray(secData.audit_logs) ? secData.audit_logs : [];
        const incomingPins = Array.isArray(secData.pins) ? secData.pins : [];
        const incomingWorkspaces = Array.isArray(secData.workspaces) ? secData.workspaces : [];

        setDbUsers(incomingUsers);
        setAuditLogs(incomingLogs);
        setPins(incomingPins);
        setWorkspaces(incomingWorkspaces);
        if (incomingWorkspaces.length > 0 && !selectedWorkspaceId) {
          setSelectedWorkspaceId(incomingWorkspaces[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedWorkspaceId, user.token]);

  const handleCopyPin = (code: string) => {
    try {
      navigator.clipboard.writeText(code);
      setCopiedPin(code);
      setTimeout(() => setCopiedPin(null), 2500);
      toast({
        title: "PIN Copied",
        description: `BrandPIN code ${code} copied to clipboard.`,
        variant: "info",
      });
    } catch {}
  };

  const handleRedeemPin = async (overrideCode?: string) => {
    const code = (overrideCode || redeemPinInput).trim();
    if (!code) {
      toast({
        title: "BrandPIN Required",
        description: "Please enter a valid BrandPIN code (e.g. ECO-8821).",
        variant: "error",
      });
      return;
    }

    setRedeemingPin(true);
    try {
      const res = await fetch("/api/pins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user.id || "",
          "X-User-Email": user.email || "",
          ...(user.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({
          pin_code: code,
          email: user.email,
          user_id: user.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "PIN Verification Failed",
          description: data.detail || "Invalid or already burned BrandPIN.",
          variant: "error",
        });
        return;
      }

      setRedeemPinInput("");
      toast({
        title: "Clearance Granted: Approved & Lobby Unlocked",
        description: `BrandPIN ${code} successfully burned! Workspace clearance active for ${data.pin?.brand_name || "Workspace"}.`,
        variant: "success",
      });

      // Instantly trigger clearance and permissions sync
      await refreshAccessStatus();
      await loadSecurityData(true);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("brandlens-role-updated"));
      }
    } catch (err: any) {
      toast({
        title: "Redemption Error",
        description: err.message || "Failed to redeem BrandPIN.",
        variant: "error",
      });
    } finally {
      setRedeemingPin(false);
    }
  };

  const handleGeneratePin = async () => {
    setGeneratingPin(true);
    try {
      const res = await fetch("/api/pins/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user.id || "",
          "X-Security-Role": user.securityRole || "ADMIN",
          ...(user.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({
          brand_id: selectedWorkspaceId || undefined,
          prefix: newPinPrefix.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "PIN Generation Failed",
          description: data.detail || "Could not generate BrandPIN.",
          variant: "error",
        });
        return;
      }

      toast({
        title: "BrandPIN Generated",
        description: `New single-use PIN: ${data.pin_code}. Share this with a team member to grant instant clearance.`,
        variant: "success",
      });

      await loadSecurityData(true);
    } catch (err: any) {
      toast({
        title: "Generation Error",
        description: err.message || "Failed to generate PIN.",
        variant: "error",
      });
    } finally {
      setGeneratingPin(false);
    }
  };

  useEffect(() => {
    loadSecurityData(false);
  }, [loadSecurityData]);

  // Poll every 3.5s so role changes & requests reflect ASAP across sessions
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = window.setInterval(() => {
      loadSecurityData(true);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [isAuthenticated, loadSecurityData]);

  const handleGrantAction = async (
    targetUserId: string,
    action: "approve" | "revoke" | "grant_lobby" | "revoke_lobby"
  ) => {
    isMutatingRef.current = true;
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
        await loadSecurityData(true, true);
        await refreshAccessStatus();
        window.dispatchEvent(new CustomEvent("brandlens-role-updated"));
        try {
          localStorage.setItem("brandlens-role-updated-ts", String(Date.now()));
        } catch {}
      } else {
        toast({ title: "Action failed", description: data.error, variant: "error" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    } finally {
      isMutatingRef.current = false;
    }
  };

  const handleUpdateUserRole = async (
    targetUserId: string,
    newRole: "ADMIN" | "REVIEWER" | "CREATOR"
  ) => {
    isMutatingRef.current = true;
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
        if (data.user) {
          setDbUsers((prev) =>
            prev.map((u) => (u.id === data.user.id ? { ...u, ...data.user } : u))
          );
        }
        toast({
          title: `Role Updated to ${newRole === "REVIEWER" ? "MANAGER" : newRole}`,
          description: data.message,
          variant: "success",
        });
        await loadSecurityData(true, true);
        await refreshAccessStatus();
        window.dispatchEvent(new CustomEvent("brandlens-role-updated"));
        try {
          localStorage.setItem("brandlens-role-updated-ts", String(Date.now()));
        } catch {}
      } else {
        toast({
          title: "Role Update Denied",
          description: data.error || "Only Super Admin can change user roles.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    } finally {
      isMutatingRef.current = false;
    }
  };

  const handleResolveRoleRequest = async (
    targetUserId: string,
    approve: boolean
  ) => {
    isMutatingRef.current = true;
    try {
      const res = await fetch("/api/access/grant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Role": "manager",
          "X-Security-Role": user.securityRole || "SUPER_ADMIN",
          "X-User-Id": user.id,
        },
        body: JSON.stringify({
          target_user_id: targetUserId,
          action: approve ? "approve_role_request" : "reject_role_request",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.user) {
          setDbUsers((prev) =>
            prev.map((u) => (u.id === data.user.id ? { ...u, ...data.user } : u))
          );
        }
        toast({
          title: approve ? "Role Request Approved" : "Role Request Declined",
          description: data.message,
          variant: approve ? "success" : "info",
        });
        await loadSecurityData(true, true);
        await refreshAccessStatus();
        window.dispatchEvent(new CustomEvent("brandlens-role-updated"));
        try {
          localStorage.setItem("brandlens-role-updated-ts", String(Date.now()));
        } catch {}
      } else {
        toast({
          title: "Action Failed",
          description: data.error || "Could not process role request.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    } finally {
      isMutatingRef.current = false;
    }
  };

  const pendingRoleRequests = dbUsers.filter(
    (u) => u.role_request_status === "pending" && u.requested_role
  );

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
              : "Workspace Access & Role Requests"}
          </span>
        }
        title="User Roles & Lobby Permissions"
        description="Manage workspace roles, respond to role change requests, and grant or revoke Lobby permissions in real time."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setLoginModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-500 transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add / Switch Account
            </button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => loadSecurityData(false)}
              disabled={loading}
            >
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
          <div className="text-xs text-ink-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <Building2 className="h-3.5 w-3.5 text-brand-600" />
            <span>{user.email}</span>
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 uppercase">
              {isSuperAdmin
                ? "SUPER ADMIN"
                : user.securityRole === "REVIEWER"
                ? "MANAGER"
                : user.securityRole || "CREATOR"}
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

      {/* BRANDPIN CLEARANCE & REDEMPTION CARD */}
      <Card className="overflow-hidden border-brand-200/90 bg-gradient-to-r from-brand-50/50 via-white to-purple-50/40 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white shadow-xs">
                <Ticket className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-bold text-ink-950">
                Redeem BrandPIN for Immediate Clearance
              </h3>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
                  user.isApproved && user.lobbyAccess !== false
                    ? "bg-mint-100 text-mint-800 border border-mint-200"
                    : user.isApproved
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-rose-100 text-rose-800 border border-rose-200"
                )}
              >
                {user.isApproved && user.lobbyAccess !== false
                  ? "Clearance Active (Approved & Lobby Granted)"
                  : user.isApproved
                  ? "Approved (Lobby Pending)"
                  : "Clearance Pending"}
              </span>
            </div>
            <p className="text-xs text-ink-600 leading-relaxed max-w-2xl">
              Enter a single-use BrandPIN issued by a Workspace Admin (e.g., <code className="font-mono font-bold text-brand-700 bg-brand-100/70 px-1 py-0.5 rounded">ECO-8821</code>) to immediately verify your identity, activate your clearance status, and unlock Lobby room permissions.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleRedeemPin();
            }}
            className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap"
          >
            <div className="relative">
              <input
                type="text"
                placeholder="Enter PIN (e.g. ECO-8821)"
                value={redeemPinInput}
                onChange={(e) => setRedeemPinInput(e.target.value.toUpperCase())}
                className="w-48 sm:w-56 rounded-xl border border-brand-200 bg-white px-3.5 py-2 text-xs font-mono font-bold uppercase tracking-wider text-ink-950 shadow-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <button
              type="submit"
              disabled={redeemingPin || !redeemPinInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-500 disabled:opacity-50 transition"
            >
              <KeyRound className={cn("h-3.5 w-3.5", redeemingPin && "animate-spin")} />
              {redeemingPin ? "Verifying..." : "Redeem BrandPIN"}
            </button>
          </form>
        </div>
      </Card>

      {/* BRANDPIN TOKEN MANAGEMENT (ADMIN & SUPER ADMIN) */}
      {(isSuperAdmin || isAdmin) && (
        <Card className="overflow-hidden border-line">
          <div className="px-6 py-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-ink-50/30">
            <div>
              <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
                <Ticket className="h-4 w-4 text-brand-600" />
                BrandPIN Issuance &amp; Token Registry ({pins.length})
              </h3>
              <p className="text-xs text-ink-500 mt-0.5">
                Generate single-use BrandPIN tokens with custom workspace prefixes to onboard creators and grant immediate clearance.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Prefix"
                value={newPinPrefix}
                maxLength={6}
                onChange={(e) => setNewPinPrefix(e.target.value.toUpperCase())}
                className="w-20 rounded-xl border border-line bg-white px-2.5 py-1.5 text-xs font-mono font-bold uppercase text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />

              <button
                type="button"
                onClick={handleGeneratePin}
                disabled={generatingPin}
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-purple-500 disabled:opacity-50 transition"
              >
                <Sparkles className={cn("h-3.5 w-3.5", generatingPin && "animate-spin")} />
                {generatingPin ? "Generating..." : "Generate BrandPIN"}
              </button>
            </div>
          </div>

          <div className="divide-y divide-line max-h-72 overflow-y-auto">
            {pins.length === 0 ? (
              <div className="p-6 text-center text-xs text-ink-500">
                No BrandPINs issued yet. Generate your first BrandPIN above.
              </div>
            ) : (
              pins.map((pin) => {
                const isExpired = new Date(pin.expires_at).getTime() < Date.now();
                return (
                  <div
                    key={pin.id || pin.pin_code}
                    className="px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-ink-50/40"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold bg-ink-100 text-ink-950 px-2 py-1 rounded-lg border border-line">
                        {pin.pin_code}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyPin(pin.pin_code)}
                        className="text-ink-400 hover:text-ink-800 transition p-1"
                        title="Copy PIN Code"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink-800">
                          {pin.brand_name || "Workspace"}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold",
                            pin.is_used
                              ? "bg-ink-100 text-ink-500"
                              : isExpired
                              ? "bg-rose-100 text-rose-700"
                              : "bg-mint-100 text-mint-800 border border-mint-200"
                          )}
                        >
                          {pin.is_used
                            ? `Redeemed by ${pin.used_by_email || "user"}`
                            : isExpired
                            ? "Expired"
                            : "Active (Single-Use)"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-400">
                        Expires: {new Date(pin.expires_at).toLocaleDateString()}
                      </span>
                      {!pin.is_used && (
                        <button
                          type="button"
                          onClick={() => handleRedeemPin(pin.pin_code)}
                          disabled={redeemingPin}
                          className="rounded-lg border border-brand-200 bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700 hover:bg-brand-100 transition"
                        >
                          Redeem Now
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      )}

      {/* SUPER ADMIN: PENDING ROLE CHANGE REQUESTS */}
      {isSuperAdmin && pendingRoleRequests.length > 0 && (
        <Card className="overflow-hidden border-amber-300 bg-amber-50/40">
          <div className="px-6 py-4 border-b border-amber-200 bg-amber-100/50 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-ink-950 flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-700" />
                Pending User Role Change Requests ({pendingRoleRequests.length})
              </h3>
              <p className="text-xs text-ink-600 mt-0.5">
                Users below have requested a role change. Approving updates their role immediately across their active session.
              </p>
            </div>
          </div>
          <div className="divide-y divide-amber-200/70">
            {pendingRoleRequests.map((u) => (
              <div
                key={`req-${u.id}`}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-white/80"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-ink-950">{u.name}</span>
                    <span className="font-mono text-ink-500">({u.email})</span>
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-700">
                      Current: {u.role === "REVIEWER" ? "MANAGER" : u.role}
                    </span>
                    <span className="text-amber-700 font-bold">&rarr;</span>
                    <span className="rounded-full bg-purple-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                      Requested: {u.requested_role === "REVIEWER" ? "MANAGER (REVIEWER)" : u.requested_role}
                    </span>
                  </div>
                  {u.role_request_note && (
                    <p className="text-[11px] text-ink-600 mt-1 italic">
                      Note: &ldquo;{u.role_request_note}&rdquo;
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleResolveRoleRequest(u.id, true)}
                    className="inline-flex items-center gap-1 rounded-xl bg-mint-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-mint-500 transition shadow-xs"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve Role Change
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveRoleRequest(u.id, false)}
                    className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* NON-SUPER-ADMIN: ROLE CHANGES ARE MANAGED EXCLUSIVELY IN PERSONAL DASHBOARD */}
      {!isSuperAdmin && (
        <Card className="overflow-hidden border-purple-200/80 bg-gradient-to-r from-purple-50/40 via-white to-brand-50/20 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-ink-900">
                  Role Elevation &amp; Personal Projects
                </span>
                <span className="text-[11px] text-ink-500">
                  Current Role: <strong className="text-ink-900">{user.roleLabel}</strong>
                </span>
                {user.roleRequestStatus === "pending" && (
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                    Request Pending ({user.requestedRole})
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-500">
                To request role changes from the Super Admin or manage your profile and project history, use your Personal Dashboard.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPersonalDashboardOpen(true)}
              className="shrink-0 h-8 text-xs font-semibold"
            >
              <User className="h-3.5 w-3.5 mr-1.5" />
              Open Personal Dashboard
            </Button>
          </div>
        </Card>
      )}

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
                ? "Super Admin can change any user's role (reflects immediately) and grant or revoke Lobby permissions."
                : isAdmin
                ? "Grant or revoke Lobby permissions for creators and managers in your workspace."
                : "Registered workspace members and their live role and Lobby permission status."}
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
            const hasPendingRoleReq =
              u.role_request_status === "pending" && Boolean(u.requested_role);

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
                          {hasLobbyAccess
                            ? "Lobby Permission: Granted"
                            : "Lobby Permission: Revoked"}
                        </span>
                      )}
                      {hasPendingRoleReq && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                          <Clock className="h-3 w-3" />
                          Requested Role:{" "}
                          {u.requested_role === "REVIEWER" ? "MANAGER" : u.requested_role}
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
                    {isSuperAdmin && hasPendingRoleReq && (
                      <button
                        type="button"
                        onClick={() => handleResolveRoleRequest(u.id, true)}
                        className="inline-flex items-center gap-1 rounded-xl bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-amber-500 transition shadow-xs"
                      >
                        <Check className="h-3 w-3" />
                        Approve{" "}
                        {u.requested_role === "REVIEWER" ? "Manager" : u.requested_role}
                      </button>
                    )}

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

                    {(isSuperAdmin || (isManager && u.role !== "ADMIN")) &&
                      (hasLobbyAccess ? (
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
                      ))}
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
                  {user.isApproved ? (
                    <Unlock className="h-5 w-5" />
                  ) : (
                    <Lock className="h-5 w-5" />
                  )}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-ink-900">
                    {user.isApproved
                      ? "Workspace Access Authorized"
                      : "Workspace Access Pending Approval"}
                  </h3>
                  <p className="text-xs text-ink-600 mt-1 max-w-2xl leading-relaxed">
                    {user.isApproved
                      ? `Your account (${user.email}) is active. Role: ${
                          user.securityRole || "CREATOR"
                        } · Lobby Permission: ${
                          user.lobbyAccess !== false ? "Granted" : "Revoked"
                        }.`
                      : `Your account (${user.email}) is awaiting approval.`}
                  </p>
                </div>
              </div>

              <div>
                {!user.isApproved ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={async () => {
                        await requestAccess();
                        toast({
                          title: "Request submitted",
                          description: "Your access request has been forwarded to Super Admin.",
                          variant: "success",
                        });
                      }}
                    >
                      Submit Access Request
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        window.scrollTo({ top: 200, behavior: "smooth" });
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 transition shadow-xs"
                    >
                      <Ticket className="h-3.5 w-3.5" />
                      Redeem BrandPIN
                    </button>
                  </div>
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
