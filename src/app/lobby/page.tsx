"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  KeyRound,
  ShieldCheck,
  Send,
  Sparkles,
  CheckCircle2,
  Plus,
  Copy,
  Check,
  Lock,
  Unlock,
  MessageSquare,
  FileText,
  RefreshCw,
  ArrowRight,
  Crown,
  Mail,
  Trash2,
  Ban,
  Search,
  X,
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  initAuth,
  googleSignIn,
  getAccessToken,
} from "@/lib/google-workspace-auth";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/providers/toast-provider";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LobbyParticipant {
  user_id: string;
  name: string;
  email?: string;
  role: "manager" | "content_creator";
  joined_at: string;
}

interface LobbyNote {
  id: string;
  author_name: string;
  author_role: "manager" | "content_creator";
  text: string;
  timestamp: string;
}

interface ReviewLobbySession {
  room_code: string;
  title: string;
  created_by: string;
  created_by_email?: string;
  manager_id?: string;
  created_at: string;
  status: "active" | "approved" | "closed";
  permission_granted?: boolean;
  shared_brand_guidelines: string;
  shared_content_draft: string;
  participants: LobbyParticipant[];
  notes: LobbyNote[];
  last_score?: number;
}

interface DBUserSummary {
  id: string;
  username: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "REVIEWER" | "CREATOR";
  brand_name: string;
  department: string;
  is_approved: boolean;
  lobby_access?: boolean;
}

export default function CollaborativeLobbyPage() {
  const {
    user,
    isAuthenticated,
    setLoginModalOpen,
    isManager,
    isAdmin,
    isSuperAdmin,
    refreshAccessStatus,
  } = useAuth();
  const { toast } = useToast();

  const [lobbies, setLobbies] = useState<ReviewLobbySession[]>([]);
  const [activeLobby, setActiveLobby] = useState<ReviewLobbySession | null>(null);
  const [employees, setEmployees] = useState<DBUserSummary[]>([]);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [roomSearchQuery, setRoomSearchQuery] = useState("");

  // Create Room modal/form state (for regular Admins only)
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [newRoomRecipientEmail, setNewRoomRecipientEmail] = useState("");
  const [sendGmailOnCreate, setSendGmailOnCreate] = useState(false);
  const [newRoomGuidelines, setNewRoomGuidelines] = useState(
    "1. Never claim products are 100% chemical-free or miraculous cures.\n2. Always cite clinical sample sizes (e.g., n=48, 8 weeks).\n3. Maintain calm, laboratory-grounded editorial tone."
  );
  const [newRoomDraft, setNewRoomDraft] = useState(
    "Introducing our new Botanical Dew Serum — formulated with 2% fermented ectoin to visibly calm redness in 8 weeks (clinical study, n=52)."
  );

  // Optional Gmail OAuth for emailing room code on room creation
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState(true);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [sendingGmailOtp, setSendingGmailOtp] = useState(false);

  const [pendingGmailConfirmation, setPendingGmailConfirmation] = useState<{
    recipients: string;
    roomCode: string;
    lobbyTitle: string;
    otpType: "lobby_pin";
  } | null>(null);

  // Shared editor state
  const [draftContent, setDraftContent] = useState("");
  const [guidelinesContent, setGuidelinesContent] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [runningAudit, setRunningAudit] = useState(false);
  const [liveAuditFindings, setLiveAuditFindings] = useState<any[]>([]);

  // Clear activeLobby if user switches to Super Admin (Super Admin cannot access inside any lobby) or switches user
  useEffect(() => {
    setActiveLobby(null);
    setCreatingRoom(false);
  }, [user.id, user.email, isSuperAdmin]);

  const fetchLobbiesAndUsers = useCallback(async () => {
    try {
      const query = new URLSearchParams({
        user_id: user.id || "",
        email: user.email || "",
        security_role: user.securityRole || "",
        role: user.role || "",
      });
      const [lobbyRes, pinsRes] = await Promise.all([
        fetch(`/api/lobby?${query.toString()}`),
        fetch("/api/pins"),
      ]);
      if (lobbyRes.ok) {
        const data = await lobbyRes.json();
        if (Array.isArray(data)) {
          setLobbies(data);
        }
      }
      if (pinsRes.ok) {
        const secData = await pinsRes.json();
        if (Array.isArray(secData.users)) {
          setEmployees(secData.users);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [user.email, user.id, user.role, user.securityRole]);

  useEffect(() => {
    fetchLobbiesAndUsers();
    refreshAccessStatus();
  }, [fetchLobbiesAndUsers, refreshAccessStatus]);

  useEffect(() => {
    const unsubscribe = initAuth(
      (gUser, token) => {
        setGoogleUser(gUser);
        setGoogleToken(token);
        setNeedsGoogleAuth(false);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
        setNeedsGoogleAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setIsGoogleSigningIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setGoogleToken(result.accessToken);
        setNeedsGoogleAuth(false);
        toast({
          title: "Gmail Connected",
          description: `Connected ${result.user.email} for emailing room invites.`,
          variant: "success",
        });
      }
    } catch (err: any) {
      toast({
        title: "Google Sign-In Cancelled",
        description: err?.message || "Could not connect to Google Workspace.",
        variant: "error",
      });
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  const executeConfirmedGmailSend = async () => {
    if (!pendingGmailConfirmation) return;
    const activeToken = (await getAccessToken()) || googleToken;
    if (!activeToken) {
      setNeedsGoogleAuth(true);
      toast({
        title: "Sign in with Google Required",
        description: "Please connect Google first to send the room code email.",
        variant: "error",
      });
      return;
    }

    setSendingGmailOtp(true);
    try {
      const res = await fetch("/api/gmail/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          recipients: pendingGmailConfirmation.recipients,
          roomCode: pendingGmailConfirmation.roomCode,
          lobbyTitle: pendingGmailConfirmation.lobbyTitle,
          senderName: user.name,
          senderEmail: googleUser?.email || user.email,
          otpType: pendingGmailConfirmation.otpType,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast({
          title: "Room Code Emailed!",
          description: `Delivered room code to ${data.recipients.join(", ")}.`,
          variant: "success",
        });
        setPendingGmailConfirmation(null);
      } else {
        toast({
          title: "Failed to Send Email",
          description: data.error || "Gmail API rejected the request.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({
        title: "Network Error",
        description: e.message || "Could not send email.",
        variant: "error",
      });
    } finally {
      setSendingGmailOtp(false);
    }
  };

  const handleTogglePersonLobbyAccess = async (
    targetUserId: string,
    grantLobby: boolean
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
          action: grantLobby ? "grant_lobby" : "revoke_lobby",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: grantLobby
            ? "Person Lobby Permission Granted"
            : "Person Lobby Permission Revoked",
          description: data.message,
          variant: grantLobby ? "success" : "info",
        });
        await fetchLobbiesAndUsers();
      } else {
        toast({
          title: "Permission Error",
          description: data.error || "Could not update person lobby rights",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  const handleSuperAdminLobbyPermission = async (
    roomCode: string,
    grant: boolean
  ) => {
    try {
      const res = await fetch("/api/lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_lobby_permission",
          room_code: roomCode,
          permission_granted: grant,
          user_id: user.id,
          email: user.email,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: grant ? "Lobby Permission Granted" : "Lobby Permission Suspended",
          description: grant
            ? `Lobby "${data.title}" is now active and permitted.`
            : `Lobby "${data.title}" has been suspended by Super Admin.`,
          variant: grant ? "success" : "info",
        });
        await fetchLobbiesAndUsers();
      } else {
        toast({
          title: "Action Failed",
          description: data.error || "Could not update lobby permission.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  const handleSuperAdminDiscardLobby = async (roomCode: string, title: string) => {
    try {
      const res = await fetch("/api/lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "discard_lobby",
          room_code: roomCode,
          user_id: user.id,
          email: user.email,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Lobby Discarded",
          description: data.message || `Removed lobby "${title}".`,
          variant: "info",
        });
        await fetchLobbiesAndUsers();
      } else {
        toast({
          title: "Cannot Discard Lobby",
          description: data.error || "Only Super Admin can discard lobbies.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  // Strict check: Is the current user the Admin who created this room?
  const isMyCreatedRoom = useCallback(
    (room: ReviewLobbySession | null | undefined) => {
      if (!room || isSuperAdmin) return false;
      const creatorId = (room.manager_id || "").trim();
      const creatorEmail = (room.created_by_email || "").trim().toLowerCase();
      const myEmail = (user.email || "").trim().toLowerCase();
      return (
        (Boolean(creatorId) && creatorId === user.id) ||
        (Boolean(creatorEmail) && creatorEmail === myEmail)
      );
    },
    [isSuperAdmin, user.email, user.id]
  );

  // Filter lobbies strictly on the client as well to guarantee role rules
  const visibleLobbies = lobbies.filter((room) => {
    if (isSuperAdmin) {
      // Super Admin sees ALL lobbies across the system
      return true;
    }
    if (isAdmin) {
      // Regular Admin sees ONLY the room(s) created by themselves — no one else's
      return isMyCreatedRoom(room);
    }
    // Reviewers / Creators see rooms they created or joined
    return (
      isMyCreatedRoom(room) ||
      (room.participants || []).some(
        (p) =>
          p.user_id === user.id ||
          (Boolean(p.email) &&
            p.email!.toLowerCase() === (user.email || "").toLowerCase())
      )
    );
  });

  // Search filter by title or room code for 'My Joined Rooms' and 'Rooms Created by Me'
  const filteredVisibleLobbies = visibleLobbies.filter((room) => {
    const q = roomSearchQuery.trim().toLowerCase();
    if (!q) return true;
    const roomCode = (room.room_code || (room as any).lobby_code || "").toLowerCase();
    const title = (room.title || "").toLowerCase();
    return title.includes(q) || roomCode.includes(q);
  });

  const handleJoinRoom = async (codeToJoin?: string) => {
    if (isSuperAdmin) {
      toast({
        title: "Super Admin Cannot Enter Lobbies",
        description:
          "Super Admin can view all lobbies and grant/revoke permissions or discard lobbies, but cannot access inside any lobby.",
        variant: "info",
      });
      return;
    }

    const code = (codeToJoin || joinCodeInput).trim();
    if (!code) {
      toast({
        title: "Room Code Required",
        description: "Enter the 6-digit Room Code shared by the Admin who created the room.",
        variant: "error",
      });
      return;
    }

    try {
      const res = await fetch("/api/lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          room_code: code,
          user_id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          security_role: user.securityRole,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActiveLobby(data);
        setDraftContent(data.shared_content_draft);
        setGuidelinesContent(data.shared_brand_guidelines);
        setJoinCodeInput("");
        toast({
          title: "Entered Lobby Room",
          description: `Connected to "${data.title}".`,
          variant: "success",
        });
        await fetchLobbiesAndUsers();
      } else {
        toast({
          title: "Lobby Access Blocked",
          description: data.error || "Invalid room code or lobby permission revoked.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  const handleCreateLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomTitle.trim() || isSuperAdmin) return;
    try {
      const res = await fetch("/api/lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: newRoomTitle.trim(),
          creator_id: user.id,
          email: user.email,
          creator_name: user.name,
          creator_role: user.role,
          security_role: user.securityRole,
          brand_guidelines: newRoomGuidelines,
          content_draft: newRoomDraft,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const createdTitle = data.title || newRoomTitle.trim();
        const recipientToSend = newRoomRecipientEmail.trim();
        setActiveLobby(data);
        setDraftContent(data.shared_content_draft);
        setGuidelinesContent(data.shared_brand_guidelines);
        setCreatingRoom(false);
        setNewRoomTitle("");
        toast({
          title: `Created Room #${data.room_code}`,
          description:
            "Your private room is ready. Share the 6-digit Room Code only with invited collaborators.",
          variant: "success",
        });
        if (sendGmailOnCreate && recipientToSend) {
          setPendingGmailConfirmation({
            recipients: recipientToSend,
            roomCode: data.room_code,
            lobbyTitle: createdTitle,
            otpType: "lobby_pin",
          });
        }
        await fetchLobbiesAndUsers();
      } else {
        toast({
          title: "Cannot Create Lobby",
          description: data.error || "Lobby creation restricted.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  const handleSyncContent = async () => {
    if (!activeLobby || isSuperAdmin) return;
    setRunningAudit(true);
    try {
      const analyzeRes = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[Lobby Review] ${activeLobby.title}`,
          channel: "Web & Landing",
          content: draftContent,
          custom_guidelines: guidelinesContent,
          submitted_by: user.name,
          user_id: user.id,
          user_role: user.role,
        }),
      });

      let computedScore = activeLobby.last_score ?? 88;
      if (analyzeRes.ok) {
        const reviewResult = await analyzeRes.json();
        computedScore =
          reviewResult.score ?? reviewResult.overall_score ?? computedScore;
        setLiveAuditFindings(reviewResult.findings || []);
      }

      const res = await fetch("/api/lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_content",
          room_code: activeLobby.room_code,
          user_id: user.id,
          email: user.email,
          role: user.role,
          content_draft: draftContent,
          brand_guidelines: guidelinesContent,
          score: computedScore,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setActiveLobby(updated);
        toast({
          title: "Draft Synced & Audited",
          description: `Live Compliance Score: ${computedScore}/100`,
          variant: "success",
        });
      }
    } catch (e: any) {
      toast({ title: "Sync error", description: e.message, variant: "error" });
    } finally {
      setRunningAudit(false);
    }
  };

  const handleSendNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLobby || !noteInput.trim() || isSuperAdmin) return;
    try {
      const res = await fetch("/api/lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_note",
          room_code: activeLobby.room_code,
          user_id: user.id,
          email: user.email,
          author_name: user.name,
          author_role: user.role,
          text: noteInput.trim(),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setActiveLobby(updated);
        setNoteInput("");
      }
    } catch (e: any) {
      toast({ title: "Error sending note", description: e.message, variant: "error" });
    }
  };

  const handleManagerApproveLobby = async () => {
    if (!activeLobby || isSuperAdmin) return;
    try {
      const res = await fetch("/api/lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manager_approve",
          room_code: activeLobby.room_code,
          user_id: user.id,
          email: user.email,
          manager_name: user.name,
          user_role: user.role,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActiveLobby(data);
        toast({
          title: "Lobby Draft Approved",
          description: `"${data.title}" marked as Approved.`,
          variant: "success",
        });
        await fetchLobbiesAndUsers();
      } else {
        toast({
          title: "Approval Restricted",
          description: data.error || "Only Room Admins/Managers can approve.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  const myLobbyRevoked = !isSuperAdmin && user.lobbyAccess === false;

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-xl font-semibold text-ink-950">
            Sign in to access the Review Lobby
          </h1>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-500">
            Collaborative review rooms and lobby permissions require an authenticated workspace session.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" size="md" onClick={() => setLoginModalOpen(true)}>
              Sign in
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
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 border border-brand-200">
            <KeyRound className="h-3.5 w-3.5" />
            {isSuperAdmin
              ? "Super Admin Lobby Governance & Permissions"
              : isAdmin
              ? "Admin Private Lobby Rooms"
              : "Collaborative Review Lobby"}
          </span>
        }
        title={
          isSuperAdmin
            ? "Super Admin Oversight: All Lobbies & Person Permissions"
            : isAdmin
            ? "My Created Review Rooms"
            : "Join a Collaborative Review Room"
        }
        description={
          isSuperAdmin
            ? "As Super Admin, you can view all lobbies across all Admins, grant or suspend any lobby, discard any lobby, and grant or revoke lobby permission for any person. Super Admin cannot enter or access inside lobby rooms."
            : isAdmin
            ? "You can only see and manage the lobby rooms created by you. Share your room's 6-digit code with invited creators."
            : "Enter the 6-digit Room Code shared by your Admin to join and co-edit inside an authorized room."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && !isSuperAdmin && (
              <Button
                size="sm"
                variant="primary"
                disabled={myLobbyRevoked}
                onClick={() => setCreatingRoom((prev) => !prev)}
              >
                <Plus className="h-3.5 w-3.5" />
                {creatingRoom ? "Cancel" : "Create Room"}
              </Button>
            )}
          </div>
        }
      />

      {/* REVOKED PERSON PERMISSION WARNING */}
      {myLobbyRevoked && (
        <Card className="p-5 border-rose-300 bg-rose-50/80 text-rose-950">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <Lock className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold">
                Your Lobby Permission is Currently Revoked
              </h3>
              <p className="text-xs text-rose-800 mt-1">
                Your account (<strong>{user.email}</strong>) has had its Lobby Permission revoked. Ask the Super Admin to grant your Lobby Permission.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* SUPER ADMIN PANEL: GRANT OR REVOKE LOBBY PERMISSION FOR ANY PERSON */}
      {isSuperAdmin && (
        <Card className="overflow-hidden border-line">
          <div className="px-6 py-4 border-b border-line bg-gradient-to-r from-purple-50/60 via-white to-brand-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
                <Crown className="h-4 w-4 text-purple-600" />
                Super Admin Control: Grant or Revoke Person Lobby Permission
              </h3>
              <p className="text-xs text-ink-500 mt-0.5">
                Grant or revoke lobby permissions for any Admin, Manager, or Creator across workspaces.
              </p>
            </div>
            <span className="rounded-full bg-purple-100 px-3 py-1 text-[11px] font-bold text-purple-800">
              Super Admin ({user.email})
            </span>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {employees
              .filter((emp) => emp.role !== "SUPER_ADMIN")
              .map((emp) => {
                const allowed = emp.lobby_access !== false;
                return (
                  <div
                    key={emp.id}
                    className={cn(
                      "rounded-xl border p-3.5 flex items-center justify-between gap-3 transition",
                      allowed
                        ? "border-line bg-white"
                        : "border-rose-200 bg-rose-50/40"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-ink-900 truncate">
                          {emp.name}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
                            emp.role === "ADMIN"
                              ? "bg-purple-100 text-purple-800"
                              : emp.role === "REVIEWER"
                              ? "bg-brand-100 text-brand-800"
                              : "bg-mint-100 text-mint-800"
                          )}
                        >
                          {emp.role === "ADMIN"
                            ? "Admin"
                            : emp.role === "REVIEWER"
                            ? "Manager"
                            : "Creator"}
                        </span>
                      </div>
                      <div className="text-[11px] text-ink-500 truncate mt-0.5">
                        {emp.email} · {emp.brand_name}
                      </div>
                    </div>

                    {allowed ? (
                      <button
                        type="button"
                        onClick={() => handleTogglePersonLobbyAccess(emp.id, false)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition"
                      >
                        <Lock className="h-3 w-3" />
                        Revoke Permission
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleTogglePersonLobbyAccess(emp.id, true)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-mint-200 bg-mint-50 px-2.5 py-1.5 text-[11px] font-semibold text-mint-800 hover:bg-mint-100 transition"
                      >
                        <Unlock className="h-3 w-3" />
                        Grant Permission
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* CREATOR / REVIEWER: SINGLE CLEAN JOIN ROOM BAR (NOT SHOWN TO SUPER ADMIN OR REGULAR ADMIN) */}
      {!isSuperAdmin && !isAdmin && (
        <Card className="p-5 border-line bg-ink-950 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint-400/15 text-mint-300 border border-mint-400/30">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-mint-300">
                  Join a Room with 6-Digit Room Code
                </h3>
                <p className="text-xs text-white/65">
                  Enter the 6-digit Room Code provided by the Admin who created the room.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={8}
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                placeholder="6-digit code"
                disabled={myLobbyRevoked}
                className="w-40 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-center font-mono text-sm font-black tracking-[0.2em] text-white placeholder:text-white/40 placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-mint-400 disabled:opacity-50"
              />
              <Button
                size="sm"
                variant="primary"
                disabled={myLobbyRevoked}
                onClick={() => handleJoinRoom()}
                className="!bg-mint-500 hover:!bg-mint-400 !text-ink-950 font-bold"
              >
                Join Room
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* REGULAR ADMIN: CREATE NEW ROOM FORM */}
      {creatingRoom && isAdmin && !isSuperAdmin && (
        <Card className="p-6 border-brand-300 bg-brand-50/20">
          <form onSubmit={handleCreateLobby} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-ink-900">
                Create a New Private Review Room
              </h3>
              <span className="text-[11px] font-medium text-ink-500">
                Visible only to you ({user.email}) and participants you invite with the room code.
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">
                  Room Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., EcoFresh Q3 Botanical Cleanser Claims Review"
                  value={newRoomTitle}
                  onChange={(e) => setNewRoomTitle(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-xs text-ink-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-brand-600" />
                    Optional: Email Room Code via Gmail
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-normal text-ink-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendGmailOnCreate}
                      onChange={(e) => setSendGmailOnCreate(e.target.checked)}
                      className="rounded border-line text-brand-600"
                    />
                    Send email on creation
                  </label>
                </label>
                <input
                  type="text"
                  placeholder="Recipient email (optional)"
                  value={newRoomRecipientEmail}
                  onChange={(e) => setNewRoomRecipientEmail(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-xs text-ink-900"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">
                  Brand Guidelines for This Room
                </label>
                <textarea
                  rows={3}
                  value={newRoomGuidelines}
                  onChange={(e) => setNewRoomGuidelines(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white p-3 text-xs text-ink-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">
                  Initial Content Draft
                </label>
                <textarea
                  rows={3}
                  value={newRoomDraft}
                  onChange={(e) => setNewRoomDraft(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white p-3 text-xs text-ink-900"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreatingRoom(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" variant="primary">
                <Plus className="h-3.5 w-3.5" />
                Create Private Room
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* LOBBY ROOMS LIST */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-500">
              {isSuperAdmin
                ? `All Workspace Lobbies (${filteredVisibleLobbies.length}) — Super Admin Governance View`
                : isAdmin
                ? `Rooms Created by Me (${filteredVisibleLobbies.length})`
                : `My Joined Rooms (${filteredVisibleLobbies.length})`}
            </h3>
            {isAdmin && !isSuperAdmin && (
              <span className="text-[11px] text-ink-400">
                Showing only rooms created by {user.email}
              </span>
            )}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              value={roomSearchQuery}
              onChange={(e) => setRoomSearchQuery(e.target.value)}
              placeholder="Search by title or room code..."
              className="w-full rounded-xl border border-line bg-white pl-8 pr-8 py-1.5 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            {roomSearchQuery && (
              <button
                type="button"
                onClick={() => setRoomSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {filteredVisibleLobbies.length === 0 ? (
          <Card className="p-8 text-center border-line">
            <p className="text-xs font-semibold text-ink-700">
              {roomSearchQuery.trim()
                ? `No rooms match "${roomSearchQuery.trim()}" by title or room code.`
                : isSuperAdmin
                ? "No lobbies currently exist in the system."
                : isAdmin
                ? `You (${user.email}) have not created any lobby rooms yet.`
                : "You have not joined any lobby rooms yet. Enter a 6-digit Room Code above to join."}
            </p>
            {isAdmin && !isSuperAdmin && !roomSearchQuery.trim() && (
              <div className="mt-4">
                <Button size="sm" variant="primary" onClick={() => setCreatingRoom(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Create Your First Room
                </Button>
              </div>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredVisibleLobbies.map((room, idx) => {
              const roomCode = room.room_code || (room as any).lobby_code || `room-${idx}`;
              const isSelected =
                !isSuperAdmin &&
                (activeLobby?.room_code || (activeLobby as any)?.lobby_code) === roomCode;
              const isMine = isMyCreatedRoom(room);
              const permissionGranted = room.permission_granted !== false && room.status !== "closed";

              return (
                <Card
                  key={roomCode}
                  className={cn(
                    "p-4 border transition flex flex-col justify-between gap-4",
                    !permissionGranted
                      ? "border-rose-200 bg-rose-50/30"
                      : isSelected
                      ? "border-brand-500 ring-2 ring-brand-500/20 bg-brand-50/20"
                      : "border-line hover:border-brand-300"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Only the Admin who created the room sees the Room Code */}
                        {isMine ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-2.5 py-1 font-mono text-xs font-black tracking-widest text-mint-300"
                            title="Your Room Code — share with invited collaborators"
                          >
                            <KeyRound className="h-3 w-3 text-mint-400" />
                            CODE: #{roomCode}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-ink-100 border border-line px-2.5 py-1 text-[10px] font-bold text-ink-600">
                            <Lock className="h-3 w-3 text-ink-500" />
                            {isSuperAdmin
                              ? "Super Admin Oversight (No Room Access)"
                              : "Joined Room"}
                          </span>
                        )}

                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                            !permissionGranted
                              ? "bg-rose-100 text-rose-800"
                              : room.status === "approved"
                              ? "bg-mint-100 text-mint-800"
                              : "bg-amber-100 text-amber-800"
                          )}
                        >
                          {!permissionGranted ? "Permission Suspended" : room.status}
                        </span>
                      </div>

                      {typeof room.last_score === "number" && (
                        <span className="text-xs font-bold text-ink-700">
                          Score: {room.last_score}/100
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-ink-900 mt-2.5">{room.title}</h4>
                    <p className="text-[11px] text-ink-500 mt-1">
                      Created by Admin: <strong>{room.created_by || room.created_by_email}</strong> •{" "}
                      {(room.participants || []).length} participants
                    </p>
                  </div>

                  {/* ACTIONS: SUPER ADMIN vs REGULAR ADMIN / CREATOR */}
                  {isSuperAdmin ? (
                    <div className="pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-ink-500 flex items-center gap-1">
                        <Ban className="h-3 w-3 text-ink-400" />
                        Room content restricted
                      </span>
                      <div className="flex items-center gap-2">
                        {permissionGranted ? (
                          <button
                            type="button"
                            onClick={() => handleSuperAdminLobbyPermission(roomCode, false)}
                            className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition"
                          >
                            <Lock className="h-3 w-3" />
                            Revoke Lobby Permission
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSuperAdminLobbyPermission(roomCode, true)}
                            className="inline-flex items-center gap-1 rounded-xl border border-mint-300 bg-mint-50 px-2.5 py-1.5 text-[11px] font-semibold text-mint-900 hover:bg-mint-100 transition"
                          >
                            <Unlock className="h-3 w-3" />
                            Grant Lobby Permission
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSuperAdminDiscardLobby(roomCode, room.title)}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition"
                        >
                          <Trash2 className="h-3 w-3" />
                          Discard Lobby
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-3 border-t border-line flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        disabled={myLobbyRevoked || !permissionGranted}
                        variant={isSelected ? "primary" : "secondary"}
                        onClick={() => handleJoinRoom(roomCode)}
                      >
                        {!permissionGranted
                          ? "Suspended by Super Admin"
                          : isSelected
                          ? "Active Room"
                          : "Open Room"}
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ACTIVE COLLABORATIVE WORKSPACE (NEVER ACCESSIBLE TO SUPER ADMIN) */}
      {activeLobby && !isSuperAdmin && !myLobbyRevoked && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-6 border-line space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {isMyCreatedRoom(activeLobby) && (
                      <>
                        <span className="font-mono text-sm font-black tracking-widest bg-ink-950 text-mint-300 px-3 py-1 rounded-lg">
                          ROOM CODE #{activeLobby.room_code || (activeLobby as any).lobby_code}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              activeLobby.room_code || (activeLobby as any).lobby_code
                            );
                            setCopiedCode(true);
                            setTimeout(() => setCopiedCode(false), 2000);
                          }}
                          className="p-1.5 rounded-lg border border-line text-ink-600 hover:bg-ink-50"
                          title="Copy Room Code"
                        >
                          {copiedCode ? (
                            <Check className="h-3.5 w-3.5 text-mint-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </>
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-bold uppercase",
                        activeLobby.status === "approved"
                          ? "bg-mint-100 text-mint-800"
                          : "bg-brand-100 text-brand-800"
                      )}
                    >
                      {activeLobby.status}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-ink-950 mt-2">{activeLobby.title}</h3>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleSyncContent}
                    disabled={runningAudit}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", runningAudit && "animate-spin")} />
                    {runningAudit ? "Auditing..." : "Sync & Run Audit"}
                  </Button>
                  {isManager && activeLobby.status !== "approved" && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleManagerApproveLobby}
                      className="!bg-mint-600 hover:!bg-mint-500 !text-white"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Approve Draft
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-500 mb-1.5 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-purple-600" />
                  Shared Brand Knowledge Rules
                </label>
                <textarea
                  rows={4}
                  value={guidelinesContent}
                  onChange={(e) => setGuidelinesContent(e.target.value)}
                  className="w-full rounded-xl border border-line bg-ink-50/50 p-3.5 text-xs font-mono text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-ink-500 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-brand-600" />
                    Collaborative Marketing Content Draft
                  </label>
                  {typeof activeLobby.last_score === "number" && (
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-bold",
                        activeLobby.last_score >= 80
                          ? "bg-mint-100 text-mint-800"
                          : "bg-amber-100 text-amber-800"
                      )}
                    >
                      Compliance Score: {activeLobby.last_score}/100
                    </span>
                  )}
                </div>
                <textarea
                  rows={6}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white p-3.5 text-sm text-ink-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {liveAuditFindings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                    Audit Findings ({liveAuditFindings.length})
                  </h4>
                  {liveAuditFindings.map((f: any, fIdx: number) => {
                    const desc = f.explanation || f.description || "";
                    const fix = f.suggestedFix || f.suggested_fix || "";
                    const excerpt = f.evidence || f.matched_excerpt || "";
                    return (
                      <div
                        key={f.id || `finding-${fIdx}`}
                        className="rounded-lg bg-white p-3 border border-amber-200 text-xs"
                      >
                        <div className="font-bold text-ink-900">{f.title}</div>
                        <p className="text-ink-600 mt-0.5">{desc}</p>
                        {fix && (
                          <div className="mt-2 flex items-center justify-between gap-2 bg-mint-50 px-2.5 py-1.5 rounded border border-mint-200">
                            <span className="text-mint-900 font-medium">
                              Suggested Fix: &ldquo;{fix}&rdquo;
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (excerpt && draftContent.includes(excerpt)) {
                                  setDraftContent(draftContent.replace(excerpt, fix));
                                } else {
                                  setDraftContent(fix);
                                }
                              }}
                              className="rounded bg-mint-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-mint-500 shrink-0"
                            >
                              Apply Fix
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-5 border-line">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-400 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-brand-600" />
                Room Participants ({(activeLobby.participants || []).length})
              </h4>
              <div className="mt-3 space-y-2">
                {(activeLobby.participants || []).map((p, pIdx) => (
                  <div
                    key={`${p.user_id}-${pIdx}`}
                    className="flex items-center justify-between rounded-xl border border-line bg-ink-50/50 px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-ink-900">{p.name || p.email}</span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                        p.role === "manager" || (p.role as string) === "authorised_reviewer"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-mint-100 text-mint-800"
                      )}
                    >
                      {p.role === "manager" || (p.role as string) === "authorised_reviewer"
                        ? "Admin / Reviewer"
                        : "Creator"}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5 border-line flex flex-col h-[400px]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-400 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-brand-600" />
                Room Notes
              </h4>

              <div className="mt-3 flex-1 overflow-y-auto space-y-2.5 pr-1">
                {(activeLobby.notes || []).map((n: any, nIdx: number) => {
                  const isStringNote = typeof n === "string";
                  return (
                    <div
                      key={n?.id || `note-${nIdx}`}
                      className="rounded-xl border border-line bg-ink-50/60 p-3 text-xs"
                    >
                      {!isStringNote && (
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-ink-900">{n.author_name}</span>
                          <span
                            className={cn(
                              "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                              n.author_role === "manager"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-mint-100 text-mint-800"
                            )}
                          >
                            {n.author_role === "manager" ? "Admin" : "Creator"}
                          </span>
                        </div>
                      )}
                      <p className="text-ink-700 mt-1 leading-relaxed">
                        {isStringNote ? n : n.text}
                      </p>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleSendNote} className="mt-3 pt-3 border-t border-line flex gap-2">
                <input
                  type="text"
                  placeholder="Add note..."
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  className="flex-1 rounded-xl border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <Button type="submit" size="sm" variant="primary">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
            </Card>
          </div>
        </div>
      )}

      {/* GMAIL ROOM INVITE CONFIRMATION MODAL */}
      {pendingGmailConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-md p-6 border-line bg-white shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-50 border border-mint-200 text-mint-700">
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-ink-950">
                  Email Room Code via Gmail?
                </h3>
                <p className="text-xs text-ink-500 mt-0.5">
                  Send the 6-digit Room Code to your invited collaborator.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-ink-50/50 p-3.5 space-y-2.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1">
                  Recipient Email
                </label>
                <input
                  type="text"
                  value={pendingGmailConfirmation.recipients}
                  onChange={(e) =>
                    setPendingGmailConfirmation((prev) =>
                      prev ? { ...prev, recipients: e.target.value } : null
                    )
                  }
                  className="w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-900"
                />
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-line/60">
                <span className="text-ink-500">Room Code:</span>
                <span className="font-mono font-black tracking-widest bg-ink-950 text-mint-300 px-2.5 py-0.5 rounded">
                  #{pendingGmailConfirmation.roomCode}
                </span>
              </div>
            </div>

            {needsGoogleAuth && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-amber-900">
                  Connect Google first to authorize Gmail delivery:
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleGoogleLogin}
                  disabled={isGoogleSigningIn}
                >
                  {isGoogleSigningIn ? "Connecting..." : "Connect Google"}
                </Button>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={sendingGmailOtp}
                onClick={() => setPendingGmailConfirmation(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={
                  sendingGmailOtp ||
                  needsGoogleAuth ||
                  !pendingGmailConfirmation.recipients.trim()
                }
                onClick={executeConfirmedGmailSend}
              >
                <Send className="h-3.5 w-3.5" />
                {sendingGmailOtp ? "Sending..." : "Send Room Code"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
