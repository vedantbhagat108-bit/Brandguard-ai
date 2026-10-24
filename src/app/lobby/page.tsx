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
  Smartphone,
  Crown,
  Mail,
  LogOut,
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  initAuth,
  googleSignIn,
  getAccessToken,
  logoutGoogle,
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
  role: "ADMIN" | "REVIEWER" | "CREATOR";
  brand_name: string;
  department: string;
  is_approved: boolean;
  lobby_access?: boolean;
}

export default function CollaborativeLobbyPage() {
  const { user, isManager, isAdmin, requestOtp, verifyOtp, refreshAccessStatus } = useAuth();
  const { toast } = useToast();

  const [lobbies, setLobbies] = useState<ReviewLobbySession[]>([]);
  const [activeLobby, setActiveLobby] = useState<ReviewLobbySession | null>(null);
  const [employees, setEmployees] = useState<DBUserSummary[]>([]);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [demoOtpHint, setDemoOtpHint] = useState<string | null>(null);

  // Create Room modal/form state
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [newRoomRecipientEmail, setNewRoomRecipientEmail] = useState("ash258296@gmail.com");
  const [sendGmailOnCreate, setSendGmailOnCreate] = useState(true);
  const [newRoomGuidelines, setNewRoomGuidelines] = useState(
    "1. Never claim products are 100% chemical-free or miraculous cures.\n2. Always cite clinical sample sizes (e.g., n=48, 8 weeks).\n3. Maintain calm, laboratory-grounded editorial tone."
  );
  const [newRoomDraft, setNewRoomDraft] = useState(
    "Introducing our new Botanical Dew Serum — formulated with 2% fermented ectoin to visibly calm redness in 8 weeks (clinical study, n=52)."
  );

  // Google Workspace (Gmail) OAuth state (in-memory token via google-workspace-auth)
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState(true);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [sendingGmailOtp, setSendingGmailOtp] = useState(false);
  const [stepUpGmailTarget, setStepUpGmailTarget] = useState("ash258296@gmail.com");

  // Mandatory User Confirmation modal state before sending Gmail email
  const [pendingGmailConfirmation, setPendingGmailConfirmation] = useState<{
    recipients: string;
    roomCode: string;
    lobbyTitle: string;
    otpType: "lobby_pin" | "step_up_otp";
  } | null>(null);

  // Shared editor state
  const [draftContent, setDraftContent] = useState("");
  const [guidelinesContent, setGuidelinesContent] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [runningAudit, setRunningAudit] = useState(false);
  const [liveAuditFindings, setLiveAuditFindings] = useState<any[]>([]);

  const fetchLobbiesAndUsers = useCallback(async () => {
    try {
      const [lobbyRes, pinsRes] = await Promise.all([
        fetch("/api/lobby"),
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
  }, []);

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
        if (gUser.email) {
          setNewRoomRecipientEmail((prev) => prev || gUser.email || "");
          setStepUpGmailTarget((prev) => prev || gUser.email || "");
        }
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
        if (result.user.email) {
          setNewRoomRecipientEmail((prev) => prev || result.user.email || "");
          setStepUpGmailTarget((prev) => prev || result.user.email || "");
        }
        toast({
          title: "Gmail Connected",
          description: `Signed in as ${result.user.email} for 6-digit OTP email delivery.`,
          variant: "success",
        });
      }
    } catch (err: any) {
      toast({
        title: "Google Sign-In Cancelled or Failed",
        description: err?.message || "Could not connect to Google Workspace.",
        variant: "error",
      });
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setGoogleToken(null);
    setNeedsGoogleAuth(true);
    toast({
      title: "Gmail Disconnected",
      description: "Cleared in-memory Google OAuth access token.",
      variant: "info",
    });
  };

  const executeConfirmedGmailSend = async () => {
    if (!pendingGmailConfirmation) return;
    const activeToken = (await getAccessToken()) || googleToken;
    if (!activeToken) {
      setNeedsGoogleAuth(true);
      toast({
        title: "Sign in with Google Required",
        description: "Please click 'Sign in with Google' to authorize sending the OTP email.",
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
      if (res.status === 401) {
        setNeedsGoogleAuth(true);
        setGoogleToken(null);
        toast({
          title: "Gmail Session Expired",
          description: "Please sign in with Google again to send the OTP email.",
          variant: "error",
        });
        return;
      }
      if (res.ok && data.ok) {
        toast({
          title: "6-Digit OTP Sent to Gmail!",
          description: `Delivered OTP to ${data.recipients.join(", ")} via Gmail.`,
          variant: "success",
        });
        setPendingGmailConfirmation(null);
      } else {
        toast({
          title: "Failed to Send Gmail OTP",
          description: data.error || "Gmail API rejected the request.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({
        title: "Network Error",
        description: e.message || "Could not send Gmail OTP.",
        variant: "error",
      });
    } finally {
      setSendingGmailOtp(false);
    }
  };

  const handleToggleEmployeeLobbyAccess = async (
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
          title: grantLobby ? "Lobby Rights Granted" : "Lobby Rights Revoked",
          description: data.message,
          variant: grantLobby ? "success" : "info",
        });
        await fetchLobbiesAndUsers();
      } else {
        toast({
          title: "Permission Error",
          description: data.error || "Could not update lobby rights",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  const canSeeRoomPin = useCallback(
    (room: ReviewLobbySession | null | undefined) => {
      if (!room || !isAdmin) return false;
      const creatorId = room.manager_id || "";
      const creatorEmail = (room.created_by_email || "").toLowerCase();
      const createdByText = (room.created_by || "").toLowerCase();
      const myEmail = (user.email || "").toLowerCase();
      const myName = (user.name || "").toLowerCase();
      return (
        creatorId === user.id ||
        (Boolean(creatorEmail) && creatorEmail === myEmail) ||
        (Boolean(myEmail) && createdByText.includes(myEmail)) ||
        (Boolean(myName) && createdByText.includes(myName))
      );
    },
    [isAdmin, user.email, user.id, user.name]
  );

  const handleJoinRoom = async (codeToJoin?: string) => {
    const code = (codeToJoin || joinCodeInput).trim();
    if (!code) {
      toast({
        title: "PIN / Room Code Required",
        description: "Please enter the confidential Room PIN provided by the Admin creator.",
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
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActiveLobby(data);
        setDraftContent(data.shared_content_draft);
        setGuidelinesContent(data.shared_brand_guidelines);
        const showPin = canSeeRoomPin(data);
        toast({
          title: showPin ? `Joined Lobby #${data.room_code}` : "Joined Review Lobby",
          description: `Connected to "${data.title}" as ${user.name}.`,
          variant: "success",
        });
        await fetchLobbiesAndUsers();
      } else {
        toast({
          title: "Lobby Access Blocked",
          description: data.error || "Invalid room PIN or lobby rights revoked.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  const handleCreateLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomTitle.trim()) return;
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
          title: `Created 6-Digit OTP Room #${data.room_code}`,
          description:
            sendGmailOnCreate && recipientToSend
              ? `Confirm in the dialog to email the 6-digit OTP to ${recipientToSend}.`
              : "Share this 6-digit code with your Reviewer or Creator to collaborate live.",
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
          description: data.error || "Lobby access revoked.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  const handleRequestStepUpOtp = async (sendViaGmail = false) => {
    const res = await requestOtp(user.email);
    if (res.ok && res.otp_code) {
      setDemoOtpHint(res.otp_code);
      setOtpInput(res.otp_code);
      toast({
        title: "Lobby 6-Digit OTP Generated",
        description: `Code ${res.otp_code} issued for ${user.email}`,
        variant: "info",
      });
      if (sendViaGmail && stepUpGmailTarget.trim()) {
        setPendingGmailConfirmation({
          recipients: stepUpGmailTarget.trim(),
          roomCode: res.otp_code,
          lobbyTitle: activeLobby?.title || "Step-Up Session Verification",
          otpType: "step_up_otp",
        });
      }
    }
  };

  const handleVerifyStepUpOtp = async () => {
    const res = await verifyOtp(user.email, otpInput);
    if (res.ok) {
      setOtpVerified(true);
      toast({
        title: "6-Digit OTP Verified",
        description: "Session elevated with verified OTP security badge.",
        variant: "success",
      });
    } else {
      toast({
        title: "Invalid OTP",
        description: res.error || "Please check your 6-digit code.",
        variant: "error",
      });
    }
  };

  const handleSyncContent = async () => {
    if (!activeLobby) return;
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
        computedScore = reviewResult.overall_score ?? computedScore;
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
          title: "Shared Draft Synced & Audited",
          description: `Live Two-RAG Compliance Score: ${computedScore}/100`,
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
    if (!activeLobby || !noteInput.trim()) return;
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
    if (!activeLobby) return;
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
          title: "Lobby Draft Approved by Manager",
          description: `"${data.title}" marked as Approved for publishing.`,
          variant: "success",
        });
        await fetchLobbiesAndUsers();
      } else {
        toast({
          title: "Approval Restricted",
          description: data.error || "Only Managers can issue final lobby approval.",
          variant: "error",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  };

  const myLobbyRevoked = !isManager && user.lobbyAccess === false;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 border border-brand-200">
            <KeyRound className="h-3.5 w-3.5" />
            6-Digit OTP Collaborative Review Lobby
          </span>
        }
        title="Live Review Lobby, OTP Co-Editing & Employee Lobby Rights"
        description="Join a 6-digit OTP room code to co-edit brand guidelines and marketing copy in real time. Admins and Managers can grant or revoke Lobby Rights for any employee or content creator."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <Button
                size="sm"
                variant="secondary"
                disabled={myLobbyRevoked}
                onClick={() => setCreatingRoom((prev) => !prev)}
              >
                <Plus className="h-3.5 w-3.5" />
                {creatingRoom ? "Cancel" : "Create Room & Email OTP (Admin)"}
              </Button>
            )}
          </div>
        }
      />

      {/* GOOGLE WORKSPACE (GMAIL) CONNECTION BAR FOR OTP EMAIL DELIVERY */}
      <Card className="p-4 border-line bg-gradient-to-r from-white via-sky-50/40 to-mint-50/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-line shadow-sm text-rose-600">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs font-bold text-ink-900">
                  Gmail OTP Delivery Integration
                </h3>
                {!needsGoogleAuth && googleUser ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-mint-100 border border-mint-200 px-2.5 py-0.5 text-[10px] font-bold text-mint-800">
                    <CheckCircle2 className="h-3 w-3" /> Connected: {googleUser.email}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    Sign in to send OTP via Gmail
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-500 mt-0.5">
                Connect your Google account so when you create a 6-digit OTP lobby, the room code can be sent directly to the recipient&apos;s Gmail inbox with your confirmation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {needsGoogleAuth ? (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isGoogleSigningIn}
                className="gsi-material-button inline-flex items-center gap-2.5 rounded-full border border-[#747775] bg-white px-4 py-2 text-xs font-medium text-[#1f1f1f] shadow-sm hover:bg-ink-50 transition disabled:opacity-60"
              >
                <div className="gsi-material-button-state" />
                <div className="gsi-material-button-content-wrapper flex items-center gap-2">
                  <div className="gsi-material-button-icon h-4 w-4 shrink-0">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      className="block h-4 w-4"
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents font-semibold">
                    {isGoogleSigningIn ? "Connecting..." : "Sign in with Google"}
                  </span>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoogleLogout}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50 transition"
              >
                <LogOut className="h-3.5 w-3.5" />
                Disconnect Gmail
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* CREATOR REVOKED WARNING BANNER */}
      {myLobbyRevoked && (
        <Card className="p-5 border-rose-300 bg-rose-50/80 text-rose-950">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <Lock className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold">
                OTP Review Lobby Rights Revoked by Manager / Admin
              </h3>
              <p className="text-xs text-rose-800 mt-1">
                Your employee/creator account (<strong>{user.email}</strong>) currently has its Lobby Rights revoked. Ask an Admin (<strong>VedantBhagat@admin.in</strong>) or your Manager to grant your Lobby Rights in the Access Control or Lobby Rights console.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ADMIN & MANAGER PANEL: GRANT OR REVOKE EMPLOYEE / CREATOR LOBBY RIGHTS */}
      {isManager && (
        <Card className="overflow-hidden border-line">
          <div className="px-6 py-4 border-b border-line bg-gradient-to-r from-purple-50/50 via-white to-brand-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
                <Crown className="h-4 w-4 text-purple-600" />
                {isAdmin
                  ? "Admin & Manager Control: Grant or Revoke Employee / Creator Lobby Rights"
                  : "Manager Control: Grant or Revoke Employee / Creator Lobby Rights"}
              </h3>
              <p className="text-xs text-ink-500 mt-0.5">
                Instantly grant or revoke 6-digit OTP Review Lobby access for your employees and content creators.
              </p>
            </div>
            <span className="rounded-full bg-purple-100 px-3 py-1 text-[11px] font-bold text-purple-800">
              Active Role: {user.securityRole || "ADMIN"} ({user.email})
            </span>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {employees
              .filter((emp) => emp.role !== "ADMIN")
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
                        <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-600">
                          @{emp.username}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
                            emp.role === "REVIEWER"
                              ? "bg-brand-100 text-brand-800"
                              : "bg-mint-100 text-mint-800"
                          )}
                        >
                          {emp.role === "REVIEWER" ? "Manager" : "Creator"}
                        </span>
                      </div>
                      <div className="text-[11px] text-ink-500 truncate mt-0.5">
                        {emp.email} · {emp.brand_name}
                      </div>
                    </div>

                    {allowed ? (
                      <button
                        type="button"
                        onClick={() => handleToggleEmployeeLobbyAccess(emp.id, false)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition"
                      >
                        <Lock className="h-3 w-3" />
                        Revoke Lobby
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleEmployeeLobbyAccess(emp.id, true)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-mint-200 bg-mint-50 px-2.5 py-1.5 text-[11px] font-semibold text-mint-800 hover:bg-mint-100 transition"
                      >
                        <Unlock className="h-3 w-3" />
                        Grant Lobby
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* STEP-UP 6-DIGIT OTP VERIFICATION BAR + QUICK JOIN */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 border-line bg-gradient-to-r from-ink-950 to-ink-900 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint-400/15 text-mint-300 border border-mint-400/30">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-mint-300">
                  Enter Room PIN / Code
                </h3>
                <p className="text-xs text-white/65">
                  Join an active compliance room using the confidential PIN shared by the Admin creator.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="password"
              maxLength={16}
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder="Enter PIN"
              disabled={myLobbyRevoked}
              className="w-44 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-center font-mono text-base font-black tracking-[0.2em] text-white placeholder:text-white/35 placeholder:tracking-normal placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-mint-400 disabled:opacity-50"
            />
            <Button
              size="sm"
              variant="primary"
              disabled={myLobbyRevoked}
              onClick={() => handleJoinRoom()}
              className="!bg-mint-500 hover:!bg-mint-400 !text-ink-950 font-bold"
            >
              Join Lobby
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>

        <Card className="p-5 border-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200">
                <Smartphone className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-ink-900">
                  Step-Up 6-Digit OTP Session Verification
                </h3>
                <p className="text-xs text-ink-500">
                  Verify your identity with a one-time 6-digit code before signing off on regulated copy.
                </p>
              </div>
            </div>

            {otpVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-mint-100 px-2.5 py-1 text-[11px] font-bold text-mint-800">
                <CheckCircle2 className="h-3.5 w-3.5" /> OTP Verified
              </span>
            )}
          </div>

          {!otpVerified ? (
            <div className="mt-4 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRequestStepUpOtp(false)}
                  className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition"
                >
                  Request OTP ({user.email})
                </button>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="6-digit OTP"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  className="w-32 rounded-xl border border-line px-3 py-2 text-center font-mono text-xs font-bold tracking-widest text-ink-900"
                />
                <Button size="sm" variant="primary" onClick={handleVerifyStepUpOtp} disabled={otpInput.length < 6}>
                  Verify OTP
                </Button>
                {demoOtpHint && (
                  <span className="text-[11px] font-mono text-mint-700 bg-mint-50 px-2 py-1 rounded border border-mint-200">
                    OTP: <strong>{demoOtpHint}</strong>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line/60">
                <input
                  type="email"
                  value={stepUpGmailTarget}
                  onChange={(e) => setStepUpGmailTarget(e.target.value)}
                  placeholder="Recipient Gmail (e.g. ash258296@gmail.com)"
                  className="flex-1 min-w-[210px] rounded-xl border border-line bg-ink-50/40 px-3 py-1.5 text-xs text-ink-900"
                />
                <button
                  type="button"
                  onClick={() => handleRequestStepUpOtp(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-mint-300 bg-mint-50 px-3 py-1.5 text-xs font-semibold text-mint-800 hover:bg-mint-100 transition"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Generate &amp; Send OTP to Gmail
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-mint-50/70 border border-mint-200 px-3.5 py-2 text-xs text-mint-900 flex items-center justify-between">
              <span>
                Authenticated via 6-digit OTP as <strong>{user.name}</strong> ({user.email})
              </span>
              <span className="font-mono text-[10px] uppercase font-bold text-mint-700">
                Audit Logged
              </span>
            </div>
          )}
        </Card>
      </div>

      {/* CREATE NEW LOBBY MODAL/CARD */}
      {creatingRoom && (
        <Card className="p-6 border-brand-300 bg-brand-50/20">
          <form onSubmit={handleCreateLobby} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-ink-900">
                Create New 6-Digit Collaborative Review Room &amp; Send OTP via Gmail
              </h3>
              <span className="text-[11px] font-medium text-ink-500">
                Generates a confidential 6-digit Room OTP and emails it to the recipient&apos;s Gmail
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">
                  Session Title
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
                    <Mail className="h-3.5 w-3.5 text-rose-600" />
                    Recipient Gmail Address(es) for 6-Digit Room OTP
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-normal text-ink-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendGmailOnCreate}
                      onChange={(e) => setSendGmailOnCreate(e.target.checked)}
                      className="rounded border-line text-brand-600"
                    />
                    Send OTP on creation
                  </label>
                </label>
                <input
                  type="text"
                  placeholder="e.g., ash258296@gmail.com (comma-separated for multiple)"
                  value={newRoomRecipientEmail}
                  onChange={(e) => setNewRoomRecipientEmail(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-xs text-ink-900"
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-ink-400">Quick select:</span>
                  {[
                    "ash258296@gmail.com",
                    ...(googleUser?.email ? [googleUser.email] : []),
                    ...employees.map((emp) => emp.email),
                  ]
                    .filter((v, i, a) => Boolean(v) && a.indexOf(v) === i)
                    .slice(0, 5)
                    .map((emailChip) => (
                      <button
                        key={emailChip}
                        type="button"
                        onClick={() => setNewRoomRecipientEmail(emailChip)}
                        className="rounded-md border border-line bg-white px-2 py-0.5 text-[10px] font-medium text-ink-600 hover:border-brand-300 hover:bg-brand-50 transition"
                      >
                        {emailChip}
                      </button>
                    ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">
                  Shared Brand Knowledge / Policy Rules
                </label>
                <textarea
                  rows={4}
                  value={newRoomGuidelines}
                  onChange={(e) => setNewRoomGuidelines(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white p-3 text-xs text-ink-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">
                  Initial Content Draft to Review
                </label>
                <textarea
                  rows={4}
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
                <Mail className="h-3.5 w-3.5" />
                {sendGmailOnCreate && newRoomRecipientEmail.trim()
                  ? "Launch 6-Digit Room & Email OTP via Gmail"
                  : "Launch 6-Digit Room"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ACTIVE LOBBIES DIRECTORY */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {lobbies.map((room, idx) => {
          const roomCode = room.room_code || (room as any).lobby_code || `room-${idx}`;
          const isSelected =
            (activeLobby?.room_code || (activeLobby as any)?.lobby_code) === roomCode;
          const showPin = canSeeRoomPin(room);
          const isParticipant =
            showPin ||
            (room.participants || []).some(
              (p) =>
                p.user_id === user.id ||
                ((p as any).email &&
                  (p as any).email.toLowerCase() === user.email.toLowerCase())
            );

          return (
            <Card
              key={roomCode}
              className={cn(
                "p-4 border transition",
                isSelected
                  ? "border-brand-500 ring-2 ring-brand-500/20 bg-brand-50/20"
                  : "border-line hover:border-brand-300"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {showPin ? (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-2.5 py-1 font-mono text-xs font-black tracking-widest text-mint-300"
                        title="Visible only to you (Admin Creator)"
                      >
                        <KeyRound className="h-3 w-3 text-mint-400" />
                        PIN: #{roomCode}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 rounded-lg bg-ink-100 border border-line px-2.5 py-1 text-[10px] font-bold text-ink-600"
                        title="PIN can only be seen by the Admin creator"
                      >
                        <Lock className="h-3 w-3 text-ink-500" />
                        PIN Hidden (Creator Admin Only)
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        room.status === "approved"
                          ? "bg-mint-100 text-mint-800"
                          : "bg-amber-100 text-amber-800"
                      )}
                    >
                      {room.status}
                    </span>
                    {typeof room.last_score === "number" && (
                      <span className="text-xs font-bold text-ink-700">
                        Score: {room.last_score}/100
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-ink-900 mt-2">{room.title}</h4>
                  <p className="text-[11px] text-ink-500 mt-0.5">
                    Creator (Admin): {room.created_by || "Admin"} • {(room.participants || []).length} participants • {(room.notes || []).length} notes
                  </p>
                </div>

                <Button
                  size="sm"
                  disabled={myLobbyRevoked}
                  variant={isSelected ? "primary" : "secondary"}
                  onClick={() => {
                    if (isParticipant) {
                      handleJoinRoom(roomCode);
                    } else {
                      toast({
                        title: "Room PIN Required",
                        description:
                          "Enter the confidential PIN provided by the Admin creator in the box above to join this room.",
                        variant: "info",
                      });
                    }
                  }}
                >
                  {isSelected ? "Active Room" : isParticipant ? "Open Room" : "Requires PIN"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ACTIVE COLLABORATIVE WORKSPACE */}
      {activeLobby && !myLobbyRevoked && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Shared Brand Knowledge + Live Content Draft Editor */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-6 border-line space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {canSeeRoomPin(activeLobby) ? (
                      <>
                        <span className="font-mono text-sm font-black tracking-widest bg-ink-950 text-mint-300 px-3 py-1 rounded-lg">
                          PIN #{activeLobby.room_code || (activeLobby as any).lobby_code}
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
                          title="Copy Room PIN (Admin Creator Only)"
                        >
                          {copiedCode ? <Check className="h-3.5 w-3.5 text-mint-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingGmailConfirmation({
                              recipients:
                                newRoomRecipientEmail.trim() || "ash258296@gmail.com",
                              roomCode:
                                activeLobby.room_code || (activeLobby as any).lobby_code,
                              lobbyTitle: activeLobby.title,
                              otpType: "lobby_pin",
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-mint-300 bg-mint-50 px-2.5 py-1 text-[11px] font-bold text-mint-800 hover:bg-mint-100 transition"
                          title="Email this 6-digit Room OTP to a person's Gmail"
                        >
                          <Mail className="h-3 w-3" />
                          Email OTP via Gmail
                        </button>
                        <span className="rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                          Visible Only to Creator (Admin)
                        </span>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 border border-line px-3 py-1 text-xs font-bold text-ink-700">
                        <Lock className="h-3.5 w-3.5 text-ink-500" />
                        PIN Hidden · Restricted to Creator (Admin)
                      </span>
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
                    {runningAudit ? "Auditing..." : "Sync & Run Two-RAG Audit"}
                  </Button>
                  {isManager && activeLobby.status !== "approved" && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleManagerApproveLobby}
                      className="!bg-mint-600 hover:!bg-mint-500 !text-white"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Manager Final Sign-Off
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-500 mb-1.5 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-purple-600" />
                  Shared Brand Knowledge Rules (Active Context)
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
                      Live Compliance Score: {activeLobby.last_score}/100
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
                    Live Two-RAG Findings ({liveAuditFindings.length})
                  </h4>
                  {liveAuditFindings.map((f: any, fIdx: number) => (
                    <div key={f.id || `finding-${fIdx}`} className="rounded-lg bg-white p-3 border border-amber-200 text-xs">
                      <div className="font-bold text-ink-900">{f.title}</div>
                      <p className="text-ink-600 mt-0.5">{f.description}</p>
                      {f.suggested_fix && (
                        <div className="mt-2 flex items-center justify-between gap-2 bg-mint-50 px-2.5 py-1.5 rounded border border-mint-200">
                          <span className="text-mint-900 font-medium">
                            Suggested Fix: &ldquo;{f.suggested_fix}&rdquo;
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (f.matched_excerpt && draftContent.includes(f.matched_excerpt)) {
                                setDraftContent(draftContent.replace(f.matched_excerpt, f.suggested_fix));
                              } else {
                                setDraftContent(f.suggested_fix);
                              }
                            }}
                            className="rounded bg-mint-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-mint-500 shrink-0"
                          >
                            Apply Fix
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Right Column: Participants & Live Reviewer Notes */}
          <div className="space-y-4">
            <Card className="p-5 border-line">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-400 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-brand-600" />
                Active Lobby Participants ({(activeLobby.participants || []).length})
              </h4>
              <div className="mt-3 space-y-2">
                {(activeLobby.participants || []).map((p, pIdx) => (
                  <div
                    key={`${p.user_id}-${pIdx}`}
                    className="flex items-center justify-between rounded-xl border border-line bg-ink-50/50 px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-ink-900">{p.name || (p as any).email}</span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                        p.role === "manager" || (p.role as string) === "authorised_reviewer"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-mint-100 text-mint-800"
                      )}
                    >
                      {p.role === "manager" || (p.role as string) === "authorised_reviewer"
                        ? "Reviewer"
                        : "Creator"}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5 border-line flex flex-col h-[420px]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-400 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-brand-600" />
                Live Compliance Thread
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
                            {n.author_role === "manager" ? "Manager" : "Creator"}
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
                  placeholder="Add compliance note..."
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

      {/* MANDATORY USER CONFIRMATION MODAL BEFORE SENDING GMAIL OTP */}
      {pendingGmailConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-gmail-otp-title"
        >
          <Card className="w-full max-w-md p-6 border-line bg-white shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-50 border border-mint-200 text-mint-700">
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <h3
                  id="confirm-gmail-otp-title"
                  className="text-sm font-bold text-ink-950"
                >
                  Confirm Sending 6-Digit OTP via Gmail?
                </h3>
                <p className="text-xs text-ink-500 mt-0.5">
                  This action will send an email from your connected Gmail account with the 6-digit OTP code.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-ink-50/50 p-3.5 space-y-2.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1">
                  Recipient Gmail Address(es)
                </label>
                <input
                  type="text"
                  value={pendingGmailConfirmation.recipients}
                  onChange={(e) =>
                    setPendingGmailConfirmation((prev) =>
                      prev ? { ...prev, recipients: e.target.value } : null
                    )
                  }
                  placeholder="e.g., ash258296@gmail.com"
                  className="w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-900"
                />
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-line/60">
                <span className="text-ink-500">Session / Context:</span>
                <span className="font-semibold text-ink-900 truncate max-w-[230px]">
                  {pendingGmailConfirmation.lobbyTitle}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">6-Digit OTP to Email:</span>
                <span className="font-mono font-black tracking-widest bg-ink-950 text-mint-300 px-2.5 py-0.5 rounded">
                  {pendingGmailConfirmation.roomCode}
                </span>
              </div>
            </div>

            {needsGoogleAuth && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-amber-900">
                  Connect your Google account first to authorize Gmail delivery:
                </p>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isGoogleSigningIn}
                  className="gsi-material-button inline-flex items-center gap-2 rounded-full border border-[#747775] bg-white px-4 py-1.5 text-xs font-medium text-[#1f1f1f] shadow-sm hover:bg-ink-50 transition"
                >
                  <div className="gsi-material-button-icon h-4 w-4 shrink-0">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      className="block h-4 w-4"
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </div>
                  <span className="font-semibold">
                    {isGoogleSigningIn ? "Connecting..." : "Sign in with Google"}
                  </span>
                </button>
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
                {sendingGmailOtp ? "Sending via Gmail..." : "Confirm & Send Gmail OTP"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
