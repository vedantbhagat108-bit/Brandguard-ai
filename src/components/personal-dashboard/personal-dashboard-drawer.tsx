"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  X,
  User,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Users,
  Trash2,
  ArrowUpRight,
  Save,
  LogOut,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  Building,
  Briefcase,
  KeyRound,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface UserProjectReview {
  id: string;
  title: string;
  brand: string;
  status: string;
  score: number;
  submittedAt: string;
  updatedAt: string;
  openFindings: number;
}

interface UserProjectLobby {
  lobby_code: string;
  room_code: string;
  title: string;
  created_at: string;
  created_by: string;
  created_by_email?: string;
  status: string;
  permission_granted: boolean;
  participantsCount: number;
  isCreator: boolean;
}

export function PersonalDashboardDrawer() {
  const {
    user,
    isAuthenticated,
    personalDashboardOpen,
    setPersonalDashboardOpen,
    setLoginModalOpen,
    logout,
    requestRoleChange,
    updateUserProfile,
    deleteUserHistory,
    deleteUserAccount,
    refreshAccessStatus,
  } = useAuth();

  const { toast } = useToast();

  // Tab: "reviews" | "lobbies"
  const [activeTab, setActiveTab] = useState<"reviews" | "lobbies">("reviews");

  // Profile Form state
  const [profileName, setProfileName] = useState(user.name || "");
  const [profileDept, setProfileDept] = useState(user.department || "");
  const [profileBrand, setProfileBrand] = useState(user.brand_name || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  // Role Request state
  const [desiredRole, setDesiredRole] = useState<"ADMIN" | "REVIEWER" | "CREATOR">("ADMIN");
  const [roleNote, setRoleNote] = useState("");
  const [requestingRole, setRequestingRole] = useState(false);

  // Projects data state
  const [reviews, setReviews] = useState<UserProjectReview[]>([]);
  const [lobbies, setLobbies] = useState<UserProjectLobby[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Delete History modal state
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyScope, setHistoryScope] = useState<"reviews" | "lobbies" | "all">("all");
  const [clearingHistory, setClearingHistory] = useState(false);

  // Delete Account modal state
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState("");

  // Sync profile fields with user
  useEffect(() => {
    if (user) {
      setProfileName(user.name || "");
      setProfileDept(user.department || "");
      setProfileBrand(user.brand_name || "");
    }
  }, [user]);

  // Fetch project data when drawer opens
  const fetchUserProjects = useCallback(async () => {
    if (!user.id && !user.email) return;
    setLoadingProjects(true);
    try {
      const qs = new URLSearchParams({
        userId: user.id || "",
        email: user.email || "",
      });
      const res = await fetch(`/api/user/profile?${qs.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
        setLobbies(data.lobbies || []);
      }
    } catch {
      // Ignore background fetch error
    } finally {
      setLoadingProjects(false);
    }
  }, [user.email, user.id]);

  useEffect(() => {
    if (personalDashboardOpen) {
      void fetchUserProjects();
      void refreshAccessStatus();
    }
  }, [personalDashboardOpen, fetchUserProjects, refreshAccessStatus]);

  // Handle escape key and body scroll lock
  useEffect(() => {
    if (!personalDashboardOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (historyModalOpen) {
          setHistoryModalOpen(false);
        } else if (accountModalOpen) {
          setAccountModalOpen(false);
        } else {
          setPersonalDashboardOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [personalDashboardOpen, historyModalOpen, accountModalOpen, setPersonalDashboardOpen]);

  if (!personalDashboardOpen) return null;

  // Handle Profile Update
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      toast({ title: "Name required", description: "Please enter your full name.", variant: "error" });
      return;
    }
    setProfileSaving(true);
    const result = await updateUserProfile({
      name: profileName.trim(),
      department: profileDept.trim(),
      brand_name: profileBrand.trim(),
    });
    setProfileSaving(false);
    if (result.ok) {
      toast({
        title: "Profile Updated",
        description: "Your name, department, and workspace were saved.",
        variant: "success",
      });
      setEditProfileOpen(false);
    } else {
      toast({
        title: "Update Failed",
        description: result.error || "Could not save profile changes.",
        variant: "error",
      });
    }
  };

  // Handle Role Change Request
  const handleSubmitRoleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user.roleRequestStatus === "pending" && user.requestedRole === desiredRole) {
      toast({
        title: "Request Already Pending",
        description: `Your request for ${desiredRole} is already submitted and pending Super Admin review.`,
        variant: "info",
      });
      return;
    }

    setRequestingRole(true);
    const result = await requestRoleChange(desiredRole, roleNote);
    setRequestingRole(false);

    if (result.ok) {
      toast({
        title: "Role Change Requested",
        description: result.message || `Request to switch to ${desiredRole} submitted to Super Admin.`,
        variant: "success",
      });
      setRoleNote("");
      void refreshAccessStatus();
    } else {
      toast({
        title: "Request Failed",
        description: result.error || "Could not submit role request.",
        variant: "error",
      });
    }
  };

  // Handle Delete History
  const handleConfirmDeleteHistory = async () => {
    setClearingHistory(true);
    const result = await deleteUserHistory(historyScope);
    setClearingHistory(false);
    setHistoryModalOpen(false);

    if (result.ok) {
      toast({
        title: "History Cleared",
        description: `Successfully cleared ${result.deleted?.reviews ?? 0} reviews and ${result.deleted?.lobbies ?? 0} lobby rooms.`,
        variant: "success",
      });
      void fetchUserProjects();
    } else {
      toast({
        title: "History Clear Failed",
        description: result.error || "Could not clear history.",
        variant: "error",
      });
    }
  };

  // Handle Delete Account
  const handleConfirmDeleteAccount = async () => {
    if (confirmDeleteText !== "DELETE") {
      toast({
        title: "Confirmation Mismatch",
        description: 'Please type "DELETE" to confirm permanent account removal.',
        variant: "error",
      });
      return;
    }
    setDeletingAccount(true);
    const result = await deleteUserAccount();
    setDeletingAccount(false);
    setAccountModalOpen(false);

    if (result.ok) {
      toast({
        title: "Account Permanently Deleted",
        description: "Your user account, personal lobby rooms, and reviews were permanently purged.",
        variant: "success",
      });
    } else {
      toast({
        title: "Account Deletion Failed",
        description: result.error || "Could not delete account.",
        variant: "error",
      });
    }
  };

  const avgComplianceScore =
    reviews.length > 0
      ? Math.round(reviews.reduce((acc, r) => acc + (r.score || 0), 0) / reviews.length)
      : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink-950/40 backdrop-blur-sm transition-opacity"
        onClick={() => setPersonalDashboardOpen(false)}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Personal Dashboard"
          className="w-screen max-w-[480px] bg-white shadow-2xl flex flex-col border-l border-line"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface">
            <div>
              <h2 className="text-sm font-bold text-ink-900 flex items-center gap-2">
                <User className="h-4 w-4 text-brand-600" />
                Personal Dashboard
              </h2>
              <p className="text-[11px] text-ink-500">
                Track your projects, manage role elevation &amp; account lifecycle
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={fetchUserProjects}
                disabled={loadingProjects}
                className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition"
                title="Refresh projects"
              >
                <RefreshCw className={`h-4 w-4 ${loadingProjects ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => setPersonalDashboardOpen(false)}
                className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition"
                aria-label="Close dashboard"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* User Profile Card */}
            <div className="rounded-2xl border border-line bg-gradient-to-b from-white to-surface p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={user.name} size="md" />
                  <div>
                    <h3 className="text-sm font-bold text-ink-950 leading-tight">
                      {user.name}
                    </h3>
                    <p className="text-xs text-ink-500 font-mono">{user.email || "No email"}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-ink-400">
                      <span>{user.department || "Marketing"}</span>
                      <span>·</span>
                      <span>{user.brand_name || "Default Workspace"}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                      user.securityRole === "SUPER_ADMIN"
                        ? "bg-purple-100 text-purple-900 border border-purple-200"
                        : user.securityRole === "ADMIN"
                        ? "bg-blue-100 text-blue-900 border border-blue-200"
                        : user.securityRole === "REVIEWER"
                        ? "bg-mint-100 text-mint-900 border border-mint-200"
                        : "bg-ink-100 text-ink-800 border border-line"
                    }`}
                  >
                    {user.securityRole === "SUPER_ADMIN"
                      ? "Super Admin"
                      : user.securityRole === "ADMIN"
                      ? "Admin"
                      : user.securityRole === "REVIEWER"
                      ? "Reviewer"
                      : "Creator"}
                  </span>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-line/60">
                <div className="text-center p-2 rounded-xl bg-ink-50/60">
                  <div className="text-[11px] text-ink-500">Reviews</div>
                  <div className="text-base font-bold text-ink-900 font-mono tabular-nums">
                    {reviews.length}
                  </div>
                </div>
                <div className="text-center p-2 rounded-xl bg-ink-50/60">
                  <div className="text-[11px] text-ink-500">Avg Score</div>
                  <div className="text-base font-bold text-mint-600 font-mono tabular-nums">
                    {reviews.length > 0 ? `${avgComplianceScore}%` : "—"}
                  </div>
                </div>
                <div className="text-center p-2 rounded-xl bg-ink-50/60">
                  <div className="text-[11px] text-ink-500">Lobbies</div>
                  <div className="text-base font-bold text-ink-900 font-mono tabular-nums">
                    {lobbies.length}
                  </div>
                </div>
              </div>

              {/* Edit Profile Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setEditProfileOpen(!editProfileOpen)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-brand-600 hover:text-brand-700 py-1"
                >
                  <span>{editProfileOpen ? "Close Profile Edit" : "Update Profile Details"}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${
                      editProfileOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {editProfileOpen && (
                  <form onSubmit={handleSaveProfile} className="mt-3 space-y-3 pt-3 border-t border-line">
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-700 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="Your name"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-700 mb-1">
                        Department
                      </label>
                      <input
                        type="text"
                        value={profileDept}
                        onChange={(e) => setProfileDept(e.target.value)}
                        className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="e.g., Brand Marketing, Regulatory"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-700 mb-1">
                        Workspace / Brand Name
                      </label>
                      <input
                        type="text"
                        value={profileBrand}
                        onChange={(e) => setProfileBrand(e.target.value)}
                        className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="e.g., EcoFresh Botanicals"
                      />
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      variant="primary"
                      disabled={profileSaving}
                      className="w-full h-8 text-xs font-semibold"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {profileSaving ? "Saving..." : "Save Profile Changes"}
                    </Button>
                  </form>
                )}
              </div>
            </div>

            {/* Role & Permissions (EXCLUSIVELY HERE!) */}
            <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50/50 via-white to-brand-50/20 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-purple-900">
                    Role &amp; Permissions
                  </h3>
                </div>
                <span className="text-[11px] text-ink-500 font-medium">
                  Super Admin Governed
                </span>
              </div>

              {/* Pending Request Indicator */}
              {user.roleRequestStatus === "pending" && user.requestedRole && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-amber-600 animate-spin" />
                      Pending Super Admin Approval
                    </span>
                    <span className="font-mono text-[11px]">
                      Target: {user.requestedRole}
                    </span>
                  </div>
                  {user.roleRequestNote && (
                    <p className="text-[11px] text-amber-800 italic">
                      &ldquo;{user.roleRequestNote}&rdquo;
                    </p>
                  )}
                  <p className="text-[10px] text-amber-700">
                    Your request was sent directly to the Super Admin. As soon as approved, your role elevates immediately.
                  </p>
                </div>
              )}

              {user.roleRequestStatus === "approved" && (
                <div className="rounded-xl border border-mint-300 bg-mint-50 p-2.5 text-xs font-medium text-mint-900 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-mint-600 shrink-0" />
                  <span>Role approved and updated by Super Admin.</span>
                </div>
              )}

              {user.securityRole === "SUPER_ADMIN" ? (
                <p className="text-xs text-ink-600">
                  You are the platform <strong>Super Admin</strong>. You have full oversight over all roles, permissions, workspaces, and lobby rooms.
                </p>
              ) : (
                <form onSubmit={handleSubmitRoleRequest} className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-700 mb-1">
                      Request Role Elevation
                    </label>
                    <select
                      value={desiredRole}
                      onChange={(e) =>
                        setDesiredRole(e.target.value as "ADMIN" | "REVIEWER" | "CREATOR")
                      }
                      className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="ADMIN">Workspace Admin (Create &amp; Manage Lobby Rooms)</option>
                      <option value="REVIEWER">Reviewer / Manager (Approve Brand Compliance Reviews)</option>
                      <option value="CREATOR">Content Creator (Submit &amp; Collaborate)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-700 mb-1">
                      Reason / Justification for Super Admin (Optional)
                    </label>
                    <textarea
                      value={roleNote}
                      onChange={(e) => setRoleNote(e.target.value)}
                      placeholder="e.g. Need Admin rights to create private review lobbies for the Q3 campaign launch."
                      rows={2}
                      className="w-full rounded-xl border border-line bg-white p-2.5 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    variant="primary"
                    disabled={requestingRole}
                    className="w-full h-8 text-xs font-semibold !bg-purple-600 hover:!bg-purple-500"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    {requestingRole
                      ? "Submitting Request..."
                      : user.roleRequestStatus === "pending"
                      ? "Update Role Request"
                      : "Submit Role Request to Super Admin"}
                  </Button>
                </form>
              )}
            </div>

            {/* Project & Activity Tracker */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-700">
                  My Projects &amp; Activity
                </h3>
                {/* Segmented Tab */}
                <div className="flex items-center p-0.5 bg-ink-100 rounded-lg text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setActiveTab("reviews")}
                    className={`px-2.5 py-1 rounded-md transition ${
                      activeTab === "reviews"
                        ? "bg-white text-ink-900 shadow-sm"
                        : "text-ink-500 hover:text-ink-900"
                    }`}
                  >
                    Reviews ({reviews.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("lobbies")}
                    className={`px-2.5 py-1 rounded-md transition ${
                      activeTab === "lobbies"
                        ? "bg-white text-ink-900 shadow-sm"
                        : "text-ink-500 hover:text-ink-900"
                    }`}
                  >
                    Lobbies ({lobbies.length})
                  </button>
                </div>
              </div>

              {/* Tab 1: Reviews */}
              {activeTab === "reviews" && (
                <div className="space-y-2">
                  {loadingProjects ? (
                    <div className="py-6 text-center text-xs text-ink-400">Loading reviews...</div>
                  ) : reviews.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line p-5 text-center space-y-2">
                      <FileText className="h-6 w-6 text-ink-300 mx-auto" />
                      <p className="text-xs text-ink-500">
                        You have not submitted any compliance reviews yet.
                      </p>
                      <Link
                        href="/submit"
                        onClick={() => setPersonalDashboardOpen(false)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                      >
                        Create New Review
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  ) : (
                    reviews.map((rev) => (
                      <Link
                        key={rev.id}
                        href={`/reviews/${rev.id}`}
                        onClick={() => setPersonalDashboardOpen(false)}
                        className="block rounded-xl border border-line bg-white p-3 hover:border-brand-300 hover:shadow-sm transition group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-ink-900 truncate group-hover:text-brand-600 transition">
                              {rev.title}
                            </h4>
                            <p className="text-[11px] text-ink-400 mt-0.5">
                              <span>{rev.brand}</span>
                              <span className="mx-1">·</span>
                              <span>
                                {rev.submittedAt
                                  ? new Date(rev.submittedAt).toLocaleDateString()
                                  : "Recent"}
                              </span>
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-mono font-bold tabular-nums text-ink-900">
                              {rev.score}%
                            </span>
                            <div className="text-[10px] capitalize text-ink-500 mt-0.5">
                              {rev.status.replace("_", " ")}
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              )}

              {/* Tab 2: Lobbies */}
              {activeTab === "lobbies" && (
                <div className="space-y-2">
                  {loadingProjects ? (
                    <div className="py-6 text-center text-xs text-ink-400">Loading lobbies...</div>
                  ) : lobbies.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line p-5 text-center space-y-2">
                      <Users className="h-6 w-6 text-ink-300 mx-auto" />
                      <p className="text-xs text-ink-500">
                        You have no active or joined lobby rooms.
                      </p>
                      <Link
                        href="/lobby"
                        onClick={() => setPersonalDashboardOpen(false)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                      >
                        Go to OTP Review Lobby
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  ) : (
                    lobbies.map((room) => (
                      <Link
                        key={room.lobby_code}
                        href={`/lobby?room=${room.room_code}`}
                        onClick={() => setPersonalDashboardOpen(false)}
                        className="block rounded-xl border border-line bg-white p-3 hover:border-brand-300 hover:shadow-sm transition group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs font-bold text-ink-900 truncate group-hover:text-brand-600 transition">
                                {room.title || "Collaborative Review Room"}
                              </h4>
                              {room.isCreator && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800">
                                  Host
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-ink-400 mt-0.5">
                              <span>Code: #{room.room_code}</span>
                              <span className="mx-1">·</span>
                              <span>{room.participantsCount} participant(s)</span>
                            </p>
                          </div>
                          <span
                            className={`text-[10px] font-bold capitalize px-2 py-0.5 rounded ${
                              room.status === "approved"
                                ? "bg-mint-100 text-mint-900"
                                : room.status === "closed"
                                ? "bg-ink-100 text-ink-600"
                                : "bg-blue-100 text-blue-900"
                            }`}
                          >
                            {room.status}
                          </span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Data Lifecycle & Danger Zone */}
            <div className="rounded-2xl border border-red-200 bg-red-50/20 p-5 space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-red-900 flex items-center gap-1.5">
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  Data Lifecycle &amp; Privacy
                </h3>
                <p className="text-[11px] text-ink-500 mt-1">
                  Manage your personal activity history or remove your account.
                </p>
              </div>

              <div className="space-y-2">
                {/* Delete History */}
                <button
                  type="button"
                  onClick={() => setHistoryModalOpen(true)}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-red-200 bg-white hover:bg-red-50/50 transition text-left group"
                >
                  <div>
                    <div className="text-xs font-semibold text-ink-900 group-hover:text-red-700">
                      Clear Personal History
                    </div>
                    <div className="text-[11px] text-ink-400">
                      Choose to delete your submitted reviews, lobby rooms, or all.
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-ink-400 -rotate-90 group-hover:text-red-600" />
                </button>

                {/* Delete Account */}
                {user.securityRole !== "SUPER_ADMIN" && (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteText("");
                      setAccountModalOpen(true);
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-red-200 bg-white hover:bg-red-50/50 transition text-left group"
                  >
                    <div>
                      <div className="text-xs font-semibold text-red-700">
                        Delete Account Permanently
                      </div>
                      <div className="text-[11px] text-ink-400">
                        Deletes your credentials, personal lobbies, and reviews.
                      </div>
                    </div>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="p-4 border-t border-line bg-surface flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setPersonalDashboardOpen(false);
                setLoginModalOpen(true);
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-900 px-3 py-2 rounded-xl hover:bg-ink-100 transition"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Switch Account
            </button>
            <button
              type="button"
              onClick={() => {
                setPersonalDashboardOpen(false);
                logout();
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 px-3 py-2 rounded-xl hover:bg-red-50 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </aside>
      </div>

      {/* MODAL 1: Clear History */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-ink-950/60 backdrop-blur-sm"
            onClick={() => setHistoryModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-red-600" />
                  Clear Personal History
                </h3>
                <p className="text-xs text-ink-500 mt-1">
                  Select what history you want to remove from your account:
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="p-1 rounded-lg text-ink-400 hover:text-ink-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${
                  historyScope === "all"
                    ? "border-brand-500 bg-brand-50/30"
                    : "border-line bg-white hover:bg-ink-50/50"
                }`}
              >
                <input
                  type="radio"
                  name="history_scope"
                  checked={historyScope === "all"}
                  onChange={() => setHistoryScope("all")}
                  className="mt-0.5 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <div className="text-xs font-bold text-ink-900">
                    All Personal Activity ({reviews.length} reviews &amp; {lobbies.length} lobbies)
                  </div>
                  <div className="text-[11px] text-ink-500 mt-0.5">
                    Removes all submitted reviews and closes/deletes private rooms created by you.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${
                  historyScope === "reviews"
                    ? "border-brand-500 bg-brand-50/30"
                    : "border-line bg-white hover:bg-ink-50/50"
                }`}
              >
                <input
                  type="radio"
                  name="history_scope"
                  checked={historyScope === "reviews"}
                  onChange={() => setHistoryScope("reviews")}
                  className="mt-0.5 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <div className="text-xs font-bold text-ink-900">
                    Reviews Only ({reviews.length} reviews)
                  </div>
                  <div className="text-[11px] text-ink-500 mt-0.5">
                    Deletes submitted compliance audit reviews. Your lobby rooms will remain intact.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${
                  historyScope === "lobbies"
                    ? "border-brand-500 bg-brand-50/30"
                    : "border-line bg-white hover:bg-ink-50/50"
                }`}
              >
                <input
                  type="radio"
                  name="history_scope"
                  checked={historyScope === "lobbies"}
                  onChange={() => setHistoryScope("lobbies")}
                  className="mt-0.5 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <div className="text-xs font-bold text-ink-900">
                    Lobby Rooms Only ({lobbies.length} lobbies)
                  </div>
                  <div className="text-[11px] text-ink-500 mt-0.5">
                    Closes and deletes collaborative rooms hosted by you. Your reviews will remain intact.
                  </div>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setHistoryModalOpen(false)}
                disabled={clearingHistory}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={handleConfirmDeleteHistory}
                disabled={clearingHistory}
              >
                {clearingHistory ? "Clearing..." : "Confirm & Clear"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Delete Account */}
      {accountModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-ink-950/60 backdrop-blur-sm"
            onClick={() => setAccountModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  Delete Account Permanently
                </h3>
                <p className="text-xs text-ink-600 mt-1 leading-relaxed">
                  This will permanently delete your account (<strong>{user.email}</strong>), purge all private review lobbies created by you, and delete your submitted compliance reviews.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAccountModalOpen(false)}
                className="p-1 rounded-lg text-ink-400 hover:text-ink-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 space-y-1">
              <p className="font-semibold">This action cannot be undone.</p>
              <p>Type <code className="font-mono font-bold bg-white px-1 py-0.5 rounded border border-red-300">DELETE</code> below to confirm permanent deletion:</p>
            </div>

            <input
              type="text"
              value={confirmDeleteText}
              onChange={(e) => setConfirmDeleteText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs font-mono font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-red-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setAccountModalOpen(false)}
                disabled={deletingAccount}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={handleConfirmDeleteAccount}
                disabled={deletingAccount || confirmDeleteText !== "DELETE"}
                className="!bg-red-600 hover:!bg-red-700 text-white"
              >
                {deletingAccount ? "Deleting..." : "Permanently Delete My Account"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
