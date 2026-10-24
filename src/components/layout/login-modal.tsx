"use client";

import { useState } from "react";
import {
  ShieldCheck,
  X,
  ArrowRight,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Flame,
  Lock,
  Smartphone,
  Building2,
  UserPlus,
  RotateCcw,
} from "lucide-react";
import {
  useAuth,
  PRESET_USERS,
  PresetUserKey,
  SecurityRole,
} from "@/components/providers/auth-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type ModalTab =
  | "login"
  | "signup"
  | "forgot_password"
  | "pin_register"
  | "otp"
  | "preset";

export function LoginModal() {
  const {
    user,
    loginAs,
    loginWithCredentials,
    createAccountWithUsername,
    resetPasswordInDb,
    registerWithPin,
    requestOtp,
    verifyOtp,
    loginModalOpen,
    setLoginModalOpen,
  } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<ModalTab>("login");
  const [submitting, setSubmitting] = useState(false);

  // 1. Login (Username or Email + Password) state
  const [loginIdentifier, setLoginIdentifier] = useState("VedantBhagat@admin.in");
  const [loginPassword, setLoginPassword] = useState("");

  // 2. Create Account (Username & Password) state
  const [signupUsername, setSignupUsername] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupRole, setSignupRole] = useState<SecurityRole>("CREATOR");
  const [signupDepartment, setSignupDepartment] = useState("Marketing");
  const [signupBrandId, setSignupBrandId] = useState("b0000001-0000-4000-8000-000000000001");
  const [signupPin, setSignupPin] = useState("");

  // 3. Forgot Password / Reset Password state
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");

  // 4. Single-Use BrandPIN Registration state
  const [regName, setRegName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPin, setRegPin] = useState("");
  const [regDepartment, setRegDepartment] = useState("Brand Copywriting");

  // 5. 6-Digit OTP state
  const [otpEmail, setOtpEmail] = useState("admin@ecofresh.com");
  const [otpCode, setOtpCode] = useState("");
  const [generatedOtpPreview, setGeneratedOtpPreview] = useState<string | null>(null);

  if (!loginModalOpen) return null;

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await loginWithCredentials(loginIdentifier.trim(), loginPassword);
    setSubmitting(false);
    if (res.ok) {
      toast({
        title: "Signed In Successfully",
        description: `Authenticated "${loginIdentifier}" against the multi-tenant database.`,
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
    if (!signupUsername.trim() || !signupPassword.trim()) return;
    setSubmitting(true);
    const finalEmail =
      signupEmail.trim() || `${signupUsername.trim().toLowerCase()}@ecofresh.com`;

    const res = await createAccountWithUsername({
      username: signupUsername.trim(),
      email: finalEmail,
      password: signupPassword,
      name: signupName.trim() || signupUsername.trim(),
      role: signupRole,
      department: signupDepartment,
      brand_id: signupBrandId,
      pin_code: signupPin.trim() || undefined,
    });
    setSubmitting(false);

    if (res.ok) {
      toast({
        title: "Account Stored in Database",
        description: `Username "${signupUsername.trim()}" created and signed in.`,
        variant: "success",
      });
      setSignupUsername("");
      setSignupPassword("");
      setSignupName("");
      setSignupEmail("");
      setSignupPin("");
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
        title: "Password Reset & Stored in Database",
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

  const handlePinRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPin.trim()) return;
    setSubmitting(true);
    const res = await registerWithPin({
      username: regUsername.trim() || regEmail.trim().split("@")[0],
      name: regName.trim(),
      email: regEmail.trim(),
      password: regPassword,
      pin_code: regPin.trim().toUpperCase(),
      department: regDepartment,
    });
    setSubmitting(false);

    if (res.ok) {
      toast({
        title: "Single-Use BrandPIN Burned & Verified",
        description: `Creator account linked to ${res.brand_name || "Workspace"}. PIN ${regPin.toUpperCase()} is now permanently burned.`,
        variant: "success",
      });
    } else {
      toast({
        title: "BrandPIN Verification Failed",
        description: res.error || "Invalid or already burned BrandPIN.",
        variant: "error",
      });
    }
  };

  const handleSendOtp = async () => {
    if (!otpEmail.trim()) return;
    const res = await requestOtp(otpEmail.trim());
    if (res.ok && res.otp_code) {
      setGeneratedOtpPreview(res.otp_code);
      setOtpCode(res.otp_code);
      toast({
        title: "6-Digit Security OTP Issued",
        description: `Demo OTP for ${otpEmail}: ${res.otp_code} (auto-filled for quick testing)`,
        variant: "info",
      });
    } else {
      toast({
        title: "OTP Error",
        description: res.error || "Could not issue OTP",
        variant: "error",
      });
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await verifyOtp(otpEmail.trim(), otpCode.trim());
    setSubmitting(false);
    if (res.ok) {
      toast({
        title: "OTP Verified",
        description: `Authenticated ${otpEmail} via 6-digit one-time passcode.`,
        variant: "success",
      });
    } else {
      toast({
        title: "OTP Verification Failed",
        description: res.error || "Invalid or expired 6-digit OTP.",
        variant: "error",
      });
    }
  };

  const presetItems: {
    key: PresetUserKey;
    badge: string;
    badgeColor: string;
    desc: string;
  }[] = [
    {
      key: "vedant_admin",
      badge: "SUPER ADMIN · Primary",
      badgeColor: "bg-purple-100 text-purple-800",
      desc: "Username: VedantBhagat | Email: VedantBhagat@admin.in",
    },
    {
      key: "ecofresh_admin",
      badge: "ADMIN · EcoFresh",
      badgeColor: "bg-purple-100 text-purple-800",
      desc: "Username: admin | Email: admin@ecofresh.com",
    },
    {
      key: "ecofresh_reviewer",
      badge: "MANAGER · EcoFresh",
      badgeColor: "bg-brand-100 text-brand-800",
      desc: "Username: reviewer | Email: reviewer@ecofresh.com",
    },
    {
      key: "ecofresh_creator",
      badge: "CREATOR · EcoFresh",
      badgeColor: "bg-mint-100 text-mint-800",
      desc: "Username: creator | Email: creator@ecofresh.com",
    },
    {
      key: "manya",
      badge: "ADMIN · Aurelia Skin",
      badgeColor: "bg-purple-100 text-purple-800",
      desc: "Username: manya | Email: manya.iyer@aurelia.com",
    },
    {
      key: "priya",
      badge: "PENDING · Agency",
      badgeColor: "bg-amber-100 text-amber-800",
      desc: "Username: priya | Email: priya.sharma@agency.com",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-line bg-ink-50/70 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <KeyRound className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-ink-900">
                Authentication, Account Creation & Password Recovery
              </h3>
              <p className="text-[11px] text-ink-500">
                Username/Password DB Auth · Create Account · Forgot Password · Burnable BrandPIN · 6-Digit OTP
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

        {/* Current Active Account Banner */}
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

        {/* Tab Switcher */}
        <div className="flex border-b border-line px-6 pt-3 gap-1 overflow-x-auto">
          {[
            { id: "login", label: "Login" },
            { id: "signup", label: "Create Username & Password" },
            { id: "forgot_password", label: "Forgot Password" },
            { id: "pin_register", label: "Burn BrandPIN" },
            { id: "otp", label: "6-Digit OTP" },
            { id: "preset", label: "Quick Demo Roles" },
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
        <div className="p-6 max-h-[68vh] overflow-y-auto">
          {/* TAB 1: USERNAME / EMAIL + PASSWORD LOGIN */}
          {activeTab === "login" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div className="rounded-xl bg-ink-50 border border-line p-3 text-[11px] text-ink-600">
                <strong>Primary Admin & Seeded Accounts (Click to select username):</strong>
                <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginIdentifier("VedantBhagat@admin.in");
                    }}
                    className="text-left rounded bg-purple-50 px-2.5 py-1.5 border border-purple-200 text-purple-900 hover:border-purple-400"
                  >
                    <strong>VedantBhagat@admin.in</strong> (SUPER ADMIN)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginIdentifier("admin");
                    }}
                    className="text-left rounded bg-white px-2.5 py-1.5 border border-line text-brand-700 hover:border-brand-400"
                  >
                    <strong>admin</strong> (ADMIN)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginIdentifier("reviewer");
                    }}
                    className="text-left rounded bg-white px-2.5 py-1.5 border border-line text-brand-700 hover:border-brand-400"
                  >
                    <strong>reviewer</strong> (MANAGER)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginIdentifier("creator");
                    }}
                    className="text-left rounded bg-white px-2.5 py-1.5 border border-line text-brand-700 hover:border-brand-400"
                  >
                    <strong>creator</strong> (CREATOR)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">
                  Username or Work Email
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter username (e.g. admin) or email (admin@ecofresh.com)"
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
                  {submitting ? "Signing in..." : "Sign In with Username / Email"}
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
              <div className="rounded-xl bg-mint-50/80 border border-mint-200 p-3 text-[11px] text-mint-900 flex items-start gap-2.5">
                <UserPlus className="h-4 w-4 text-mint-700 shrink-0 mt-0.5" />
                <div>
                  <strong>Create Username & Password in Database:</strong> Your new username, hashed password (PBKDF2-SHA256), and workspace role are saved directly to <code className="font-mono font-bold">securityDB.users</code> so you can log in or reset your password anytime.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., vedant_b"
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
                    placeholder="e.g., Vedant Bhagat"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">Work Email</label>
                  <input
                    type="email"
                    placeholder="e.g., vedant@ecofresh.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">Role</label>
                  <select
                    value={signupRole}
                    onChange={(e) => setSignupRole(e.target.value as SecurityRole)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="CREATOR">Creator (CREATOR)</option>
                    <option value="REVIEWER">Reviewer (REVIEWER)</option>
                    <option value="ADMIN">Workspace Admin (ADMIN)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">Workspace</label>
                  <select
                    value={signupBrandId}
                    onChange={(e) => setSignupBrandId(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="b0000001-0000-4000-8000-000000000001">EcoFresh Botanicals</option>
                    <option value="b0000002-0000-4000-8000-000000000002">NovaTech Cloud</option>
                    <option value="b0000003-0000-4000-8000-000000000003">Aurelia Skin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">
                    BrandPIN (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Enter Admin-issued PIN"
                    value={signupPin}
                    onChange={(e) => setSignupPin(e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs font-mono uppercase text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-brand-600 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-500 flex items-center justify-center gap-2"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {submitting ? "Saving Account to Database..." : "Create Account & Store in Database"}
              </button>
            </form>
          )}

          {/* TAB 3: FORGOT PASSWORD / RESET PASSWORD IN DATABASE */}
          {activeTab === "forgot_password" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-3 text-[11px] text-amber-900 flex items-start gap-2.5">
                <RotateCcw className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong>Reset Forgotten Password in Database:</strong> Enter any existing <strong>Username</strong> (e.g. <code className="font-mono">admin</code>, <code className="font-mono">creator</code>, or your custom username) or <strong>Email</strong> and choose a new password. The database immediately updates <code className="font-mono">hashed_password</code> and logs a <code className="font-mono">PASSWORD_RESET</code> audit event.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">
                  Account Username or Email
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., admin, creator@ecofresh.com, or your custom username"
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
                  {submitting ? "Updating Password in Database..." : "Reset Password & Save to Database"}
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

          {/* TAB 4: SINGLE-USE BRANDPIN BURN REGISTRATION */}
          {activeTab === "pin_register" && (
            <form onSubmit={handlePinRegister} className="space-y-3.5">
              <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-3 text-[11px] text-amber-900 flex items-start gap-2.5">
                <Flame className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Single-Use Burnable BrandPIN:</strong> Creators must provide an unburned BrandPIN issued by an Admin. Once used, the PIN is permanently marked <code className="font-mono font-bold">is_used = true</code>.
                  <div className="mt-1 text-[10px] text-amber-800">
                    PINs are strictly confidential and visible only to the Admin creator who generated them.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Vedant Bhagat"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">Username</label>
                  <input
                    type="text"
                    placeholder="e.g., vedant_eco"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs font-mono text-ink-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">Work Email</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g., vedant@ecofresh.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">
                    Single-Use BrandPIN
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter PIN from Admin"
                    value={regPin}
                    onChange={(e) => setRegPin(e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-purple-300 bg-purple-50/40 px-3 py-2 text-xs font-mono font-bold tracking-widest text-purple-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-800 mb-1">Department</label>
                  <input
                    type="text"
                    value={regDepartment}
                    onChange={(e) => setRegDepartment(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-purple-600 py-2.5 text-xs font-semibold text-white transition hover:bg-purple-500 flex items-center justify-center gap-2"
              >
                <Flame className="h-3.5 w-3.5" />
                {submitting ? "Verifying & Burning PIN..." : "Verify & Burn BrandPIN to Onboard"}
              </button>
            </form>
          )}

          {/* TAB 5: 6-DIGIT OTP */}
          {activeTab === "otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="rounded-xl bg-brand-50/70 border border-brand-200 p-3 text-[11px] text-brand-900 flex items-start gap-2.5">
                <Smartphone className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Passwordless 6-Digit OTP Verification:</strong> Request a time-bound 6-digit OTP code for step-up authentication and Review Lobby session access.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">Account Email</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={otpEmail}
                    onChange={(e) => setOtpEmail(e.target.value)}
                    className="flex-1 rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition shrink-0"
                  >
                    Send 6-Digit OTP
                  </button>
                </div>
              </div>

              {generatedOtpPreview && (
                <div className="rounded-lg bg-mint-50 border border-mint-200 px-3 py-2 text-xs text-mint-900 flex items-center justify-between">
                  <span>Dispatched 6-Digit OTP Code:</span>
                  <span className="font-mono font-black tracking-widest text-sm text-mint-800">
                    {generatedOtpPreview}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">
                  Enter 6-Digit Security Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-center text-base font-mono font-black tracking-[0.35em] text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || otpCode.length < 6}
                className="w-full rounded-xl bg-brand-600 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
              >
                Verify 6-Digit OTP & Sign In
              </button>
            </form>
          )}

          {/* TAB 6: QUICK DEMO ROLE PRESETS */}
          {activeTab === "preset" && (
            <div className="space-y-2.5">
              {presetItems.map((item) => {
                const preset = PRESET_USERS[item.key];
                const isCurrent = user.email === preset.email;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={async () => {
                      await loginAs(item.key);
                      toast({
                        title: `Switched to ${preset.name}`,
                        description: `${preset.roleLabel} · ${preset.brand_name}`,
                        variant: "success",
                      });
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border transition flex items-center justify-between group",
                      isCurrent
                        ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-500"
                        : "border-line bg-white hover:border-brand-300 hover:bg-ink-50/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-ink-100 border border-line flex items-center justify-center text-ink-800 font-bold text-xs shrink-0">
                        {preset.initials}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-ink-900">{preset.name}</span>
                          <span className="text-[11px] font-mono text-ink-500">
                            (@{preset.username})
                          </span>
                          <span className={cn("rounded font-bold text-[10px] px-1.5 py-0.5", item.badgeColor)}>
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-500 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-ink-300 group-hover:text-brand-600 transition shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
