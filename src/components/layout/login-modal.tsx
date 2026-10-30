"use client";

import { useState } from "react";
import {
  Shield,
  ShieldCheck,
  X,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Lock,
  Building2,
  UserPlus,
  RotateCcw,
  Cloud,
} from "lucide-react";
import {
  useAuth,
  SecurityRole,
} from "@/components/providers/auth-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type ModalTab = "login" | "signup" | "forgot_password";

export function LoginModal() {
  const {
    user,
    isAuthenticated,
    cloudSynced,
    loginWithGoogleCrossDevice,
    loginWithCredentials,
    createAccountWithUsername,
    resetPasswordInDb,
    loginModalOpen,
    setLoginModalOpen,
  } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<ModalTab>("login");
  const [submitting, setSubmitting] = useState(false);

  // 1. Login (Username or Email + Password) state
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // 2. Create Account (Username & Password) state
  const [signupUsername, setSignupUsername] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupRole, setSignupRole] = useState<SecurityRole>("CREATOR");
  const [signupDepartment, setSignupDepartment] = useState("Marketing");
  const [signupWorkspace, setSignupWorkspace] = useState("");
  const [signupPinCode, setSignupPinCode] = useState("");

  // 3. Forgot Password / Reset Password state
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");

  if (!loginModalOpen) return null;

  const handleGoogleCrossDeviceLogin = async (preferredRole?: SecurityRole) => {
    setSubmitting(true);
    const res = await loginWithGoogleCrossDevice(preferredRole);
    setSubmitting(false);
    if (res.ok) {
      toast({
        title: "Cross-Device Cloud Account Synced",
        description: `Signed in as ${res.user?.email} and synced to Firebase Firestore for cross-device access.`,
        variant: "success",
      });
    } else {
      toast({
        title: "Google Cloud Sign-In Error",
        description: res.error || "Could not complete Google sign-in.",
        variant: "error",
      });
    }
  };

  const handleDemoLogin = async (identifier: string, pass: string) => {
    setSubmitting(true);
    const res = await loginWithCredentials(identifier, pass);
    setSubmitting(false);
    if (res.ok) {
      toast({
        title: "Hackathon Demo Sign-In Successful",
        description: `Signed in as test account (${identifier}).`,
        variant: "success",
      });
      setLoginModalOpen(false);
    } else {
      toast({
        title: "Demo Sign-In Failed",
        description: res.error || "Could not sign in.",
        variant: "error",
      });
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await loginWithCredentials(loginIdentifier.trim(), loginPassword);
    setSubmitting(false);
    if (res.ok) {
      toast({
        title: "Signed In Successfully",
        description: `Authenticated "${loginIdentifier}" against the workspace database.`,
        variant: "success",
      });
    } else {
      toast({
        title: "Authentication Failed",
        description: res.error || "Invalid username/email or password",
        variant: "error",
      });
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupUsername.trim() || !signupPassword.trim() || !signupEmail.trim() || !signupWorkspace.trim()) return;
    setSubmitting(true);

    const res = await createAccountWithUsername({
      username: signupUsername.trim(),
      email: signupEmail.trim(),
      password: signupPassword,
      name: signupName.trim() || signupUsername.trim(),
      role: signupRole,
      department: signupDepartment,
      workspace_name: signupWorkspace.trim(),
      brand_name: signupWorkspace.trim(),
      pin_code: signupPinCode.trim() || undefined,
    });
    setSubmitting(false);

    if (res.ok) {
      toast({
        title: "Account Created",
        description: `Account "${signupUsername.trim()}" created in workspace "${signupWorkspace.trim()}" and signed in.`,
        variant: "success",
      });
      setSignupUsername("");
      setSignupPassword("");
      setSignupName("");
      setSignupEmail("");
      setSignupWorkspace("");
      setSignupPinCode("");
    } else {
      toast({
        title: "Could Not Create Account",
        description: res.error || "Registration failed",
        variant: "error",
      });
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim() || !forgotNewPassword.trim()) return;
    if (forgotNewPassword !== forgotConfirmPassword) {
      toast({
        title: "Passwords Do Not Match",
        description: "Please make sure New Password and Confirm Password match.",
        variant: "error",
      });
      return;
    }

    setSubmitting(true);
    const res = await resetPasswordInDb(forgotIdentifier.trim(), forgotNewPassword);
    setSubmitting(false);

    if (res.ok) {
      toast({
        title: "Password Updated",
        description:
          res.message ||
          `Password updated for "${forgotIdentifier}". You can now log in with your new password.`,
        variant: "success",
      });
      setLoginIdentifier(forgotIdentifier.trim());
      setLoginPassword(forgotNewPassword);
      setForgotNewPassword("");
      setForgotConfirmPassword("");
      setActiveTab("login");
    } else {
      toast({
        title: "Password Reset Failed",
        description: res.error || "Account not found in database.",
        variant: "error",
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-line bg-ink-50/70 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <KeyRound className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-ink-900">
                Sign In or Create Account
              </h3>
              <p className="text-[11px] text-ink-500">
                Cross-Device Cloud Sync · Username/Password Sign-In · Create Account
              </p>
            </div>
          </div>
          <button
            onClick={() => setLoginModalOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Current Active Account Banner (only shown if already authenticated) */}
        {isAuthenticated && user.email && (
          <div className="bg-ink-950 px-6 py-3.5 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size="sm" tone="light" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold">{user.name}</span>
                  {user.username && (
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-mint-300">
                      @{user.username}
                    </span>
                  )}
                  <span className="text-[10px] text-white/50 font-mono">({user.email})</span>
                </div>
                <div className="text-[10px] text-white/60 flex items-center gap-1.5 mt-0.5">
                  <Building2 className="h-3 w-3 text-mint-300" />
                  <span>{user.brand_name || "EcoFresh Botanicals"}</span>
                  <span>•</span>
                  <span>{user.roleLabel}</span>
                </div>
              </div>
            </div>

            <div>
              {user.role === "manager" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2.5 py-0.5 text-[10px] font-bold text-purple-200 border border-purple-500/30">
                  <ShieldCheck className="h-3 w-3" /> {user.securityRole || "ADMIN"}
                </span>
              ) : user.isApproved ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-mint-400/20 px-2.5 py-0.5 text-[10px] font-bold text-mint-300 border border-mint-400/30">
                  <CheckCircle2 className="h-3 w-3" /> Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-400/30">
                  <AlertCircle className="h-3 w-3" /> Pending Approval
                </span>
              )}
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex border-b border-line px-6 pt-3 gap-1 overflow-x-auto">
          {[
            { id: "login", label: "Login" },
            { id: "signup", label: "Create Account" },
            { id: "forgot_password", label: "Forgot Password" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as ModalTab)}
              className={cn(
                "border-b-2 pb-2.5 text-xs font-semibold transition px-2.5 whitespace-nowrap",
                activeTab === t.id
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-ink-500 hover:text-ink-800"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 max-h-[68vh] overflow-y-auto space-y-4">
          {/* HACKATHON DEMO QUICK SIGN-IN BANNER */}
          <div className="rounded-xl border border-purple-300 bg-gradient-to-r from-purple-50 via-brand-50/50 to-white p-4 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-600 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                🚀 Hackathon Demo Quick Sign-In
              </span>
              <span className="text-[11px] text-ink-500 font-medium">Instant Test Accounts</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDemoLogin("admin@gmail.com", "Ashu@12")}
                className="rounded-xl bg-purple-700 px-3 py-2 text-xs font-bold text-white hover:bg-purple-600 transition flex items-center justify-center gap-1.5 shadow-xs"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-mint-300" />
                Super Admin
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDemoLogin("demoadmin@gmail.com", "password123")}
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 transition flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Shield className="h-3.5 w-3.5 text-mint-300" />
                Workspace Admin
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDemoLogin("demo@gmail.com", "password123")}
                className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-500 transition flex items-center justify-center gap-1.5 shadow-xs"
              >
                <UserPlus className="h-3.5 w-3.5 text-mint-300" />
                Creator
              </button>
            </div>
          </div>

          {/* Cross-Device Cloud Sync Banner */}
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Cloud className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink-900">
                    Cross-Device Cloud Sign-In
                  </span>
                  {cloudSynced && (
                    <span className="rounded-full bg-mint-100 px-2 py-0.5 text-[10px] font-bold text-mint-800">
                      Synced
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ink-600 mt-0.5">
                  Sign in with Google to access your account across any device or browser.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleGoogleCrossDeviceLogin(signupRole)}
              className="rounded-xl bg-ink-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-ink-800 transition shrink-0 flex items-center justify-center gap-1.5"
            >
              <Cloud className="h-3.5 w-3.5 text-mint-300" />
              {submitting ? "Connecting..." : "Continue with Google"}
            </button>
          </div>

          {/* TAB 1: USERNAME / EMAIL + PASSWORD LOGIN */}
          {activeTab === "login" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">
                  Username or Work Email
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter your username or email address"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-ink-800">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotIdentifier(loginIdentifier);
                      setActiveTab("forgot_password");
                    }}
                    className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-brand-600 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-500 flex items-center justify-center gap-2"
                >
                  <Lock className="h-3.5 w-3.5" />
                  {submitting ? "Signing in..." : "Sign In"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("signup")}
                  className="rounded-xl border border-line bg-ink-50 px-4 py-2.5 text-xs font-semibold text-ink-800 hover:bg-ink-100 transition flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="h-3.5 w-3.5 text-brand-600" />
                  Create New Account
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: CREATE USERNAME & PASSWORD (STORED IN DATABASE) */}
          {activeTab === "signup" && (
            <form onSubmit={handleCreateAccount} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Choose a username"
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs font-mono text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">
                    Password <span className="text-rose-500">*</span> (min 4 chars)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    placeholder="Create a password"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">Full Name</label>
                  <input
                    type="text"
                    placeholder="Your full name"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">
                    Work Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">Role</label>
                  <select
                    value={signupRole}
                    onChange={(e) => setSignupRole(e.target.value as SecurityRole)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="CREATOR">Creator (CREATOR)</option>
                    <option value="REVIEWER">Manager / Reviewer (REVIEWER)</option>
                    <option value="ADMIN">Workspace Admin (ADMIN)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">
                    Workspace <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter workspace or brand name"
                    value={signupWorkspace}
                    onChange={(e) => setSignupWorkspace(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">
                  BrandPIN (Optional - Instant Clearance)
                </label>
                <input
                  type="text"
                  placeholder="e.g. ECO-8821 (Unlocks immediate approval & lobby rights)"
                  value={signupPinCode}
                  onChange={(e) => setSignupPinCode(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-line px-3 py-2 text-xs font-mono font-bold uppercase text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-[11px] text-ink-500 mt-1">
                  If you have a 1-time BrandPIN from your admin, enter it to verify and activate lobby clearance immediately.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-brand-600 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-500 flex items-center justify-center gap-2"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {submitting ? "Creating Account..." : "Create Account"}
              </button>
            </form>
          )}

          {/* TAB 3: FORGOT PASSWORD / RESET PASSWORD IN DATABASE */}
          {activeTab === "forgot_password" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">
                  Account Username or Email
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter your username or email"
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">
                    New Password (min 4 chars)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    placeholder="Enter new password"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    placeholder="Re-enter new password"
                    value={forgotConfirmPassword}
                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-brand-600 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-500 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {submitting ? "Updating Password..." : "Reset Password"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("login")}
                  className="rounded-xl border border-line bg-ink-50 px-4 py-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-100"
                >
                  Back to Login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
