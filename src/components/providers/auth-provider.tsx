"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type AppUserRole = "manager" | "content_creator";
export type SecurityRole = "ADMIN" | "REVIEWER" | "CREATOR";

export interface UserAccount {
  id: string;
  username?: string;
  name: string;
  email: string;
  role: AppUserRole;
  securityRole?: SecurityRole;
  roleLabel: string;
  department: string;
  brand_id?: string;
  brand_name?: string;
  isApproved: boolean;
  lobbyAccess?: boolean;
  status: "approved" | "pending" | "revoked";
  initials: string;
  token?: string;
}

export type PresetUserKey =
  | "vedant_admin"
  | "ecofresh_admin"
  | "ecofresh_reviewer"
  | "ecofresh_creator"
  | "manya"
  | "arjun"
  | "priya";

export const PRESET_USERS: Record<PresetUserKey, UserAccount> = {
  vedant_admin: {
    id: "u0000000-admin-vedant",
    username: "VedantBhagat",
    name: "Vedant Bhagat",
    email: "VedantBhagat@admin.in",
    role: "manager",
    securityRole: "ADMIN",
    roleLabel: "Super Admin (ADMIN)",
    department: "Executive Governance & Security",
    brand_id: "b0000001-0000-4000-8000-000000000001",
    brand_name: "EcoFresh Botanicals",
    isApproved: true,
    lobbyAccess: true,
    status: "approved",
    initials: "VB",
  },
  ecofresh_admin: {
    id: "u0000001-0000-4000-8000-000000000001",
    username: "admin",
    name: "Elena Rostova",
    email: "admin@ecofresh.com",
    role: "manager",
    securityRole: "ADMIN",
    roleLabel: "Workspace Admin (ADMIN)",
    department: "Governance & Security",
    brand_id: "b0000001-0000-4000-8000-000000000001",
    brand_name: "EcoFresh Botanicals",
    isApproved: true,
    lobbyAccess: true,
    status: "approved",
    initials: "ER",
  },
  ecofresh_reviewer: {
    id: "u0000002-0000-4000-8000-000000000002",
    username: "reviewer",
    name: "Marcus Vance",
    email: "reviewer@ecofresh.com",
    role: "manager",
    securityRole: "REVIEWER",
    roleLabel: "Compliance Manager (REVIEWER)",
    department: "Compliance Review",
    brand_id: "b0000001-0000-4000-8000-000000000001",
    brand_name: "EcoFresh Botanicals",
    isApproved: true,
    lobbyAccess: true,
    status: "approved",
    initials: "MV",
  },
  ecofresh_creator: {
    id: "u0000003-0000-4000-8000-000000000003",
    username: "creator",
    name: "Chloe Lin",
    email: "creator@ecofresh.com",
    role: "content_creator",
    securityRole: "CREATOR",
    roleLabel: "Content Creator (PIN Verified)",
    department: "Brand Copywriting",
    brand_id: "b0000001-0000-4000-8000-000000000001",
    brand_name: "EcoFresh Botanicals",
    isApproved: true,
    lobbyAccess: true,
    status: "approved",
    initials: "CL",
  },
  manya: {
    id: "manager-1",
    username: "manya",
    name: "Manya Iyer",
    email: "manya.iyer@aurelia.com",
    role: "manager",
    securityRole: "ADMIN",
    roleLabel: "Brand Governance Manager",
    department: "Governance & Legal",
    brand_id: "b0000003-0000-4000-8000-000000000003",
    brand_name: "Aurelia Skin",
    isApproved: true,
    lobbyAccess: true,
    status: "approved",
    initials: "MI",
  },
  arjun: {
    id: "creator-1",
    username: "arjun",
    name: "Arjun Rao",
    email: "arjun.rao@aurelia.com",
    role: "content_creator",
    securityRole: "CREATOR",
    roleLabel: "Content Creator (Authorized)",
    department: "Marketing",
    brand_id: "b0000003-0000-4000-8000-000000000003",
    brand_name: "Aurelia Skin",
    isApproved: true,
    lobbyAccess: true,
    status: "approved",
    initials: "AR",
  },
  priya: {
    id: "creator-new",
    username: "priya",
    name: "Priya Sharma",
    email: "priya.sharma@agency.com",
    role: "content_creator",
    securityRole: "CREATOR",
    roleLabel: "Agency Contributor (Pending Approval)",
    department: "Paid Social",
    brand_id: "b0000003-0000-4000-8000-000000000003",
    brand_name: "Aurelia Skin",
    isApproved: false,
    lobbyAccess: false,
    status: "pending",
    initials: "PS",
  },
};

interface AuthContextValue {
  user: UserAccount;
  isManager: boolean;
  isAdmin: boolean;
  loginAs: (key: PresetUserKey) => Promise<void>;
  loginWithCredentials: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  createAccountWithUsername: (params: {
    username: string;
    email: string;
    password: string;
    name: string;
    role: SecurityRole;
    department: string;
    brand_id?: string;
    pin_code?: string;
  }) => Promise<{ ok: boolean; error?: string; user?: UserAccount }>;
  resetPasswordInDb: (
    identifier: string,
    newPassword: string
  ) => Promise<{ ok: boolean; message?: string; error?: string }>;
  registerWithPin: (params: {
    username?: string;
    name: string;
    email: string;
    password: string;
    pin_code: string;
    department: string;
  }) => Promise<{ ok: boolean; error?: string; brand_name?: string }>;
  requestOtp: (email: string) => Promise<{ ok: boolean; otp_code?: string; error?: string }>;
  verifyOtp: (email: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  loginCustom: (email: string, name: string, role: AppUserRole, department: string) => void;
  requestAccess: () => Promise<void>;
  loginModalOpen: boolean;
  setLoginModalOpen: (open: boolean) => void;
  refreshAccessStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_AUTH_KEY = "brandlens.auth.user.v4";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAccount>(PRESET_USERS.vedant_admin);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // Restore saved session
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_AUTH_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.id) setUser(parsed);
      }
    } catch {}
  }, []);

  const saveUser = useCallback((nextUser: UserAccount) => {
    setUser(nextUser);
    try {
      localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(nextUser));
    } catch {}
  }, []);

  const mapBackendUserToAccount = useCallback((apiUser: any, token?: string): UserAccount => {
    const appRole: AppUserRole =
      apiUser.role === "ADMIN" || apiUser.role === "REVIEWER" || apiUser.app_role === "manager"
        ? "manager"
        : "content_creator";
    const initials = (apiUser.name || apiUser.username || apiUser.email || "U")
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const roleLabel =
      apiUser.role === "ADMIN"
        ? "Super Admin (ADMIN)"
        : apiUser.role === "REVIEWER"
        ? "Compliance Manager (REVIEWER)"
        : apiUser.is_approved
        ? "Content Creator (Authorized)"
        : "Agency Contributor (Pending)";

    return {
      id: apiUser.id,
      username: apiUser.username || apiUser.email?.split("@")[0],
      name: apiUser.name || apiUser.username || apiUser.email,
      email: apiUser.email,
      role: appRole,
      securityRole: apiUser.role as SecurityRole,
      roleLabel,
      department: apiUser.department || "Marketing",
      brand_id: apiUser.brand_id,
      brand_name: apiUser.brand_name || "EcoFresh Botanicals",
      isApproved: Boolean(apiUser.is_approved),
      lobbyAccess:
        typeof apiUser.lobby_access === "boolean"
          ? apiUser.lobby_access
          : Boolean(apiUser.is_approved),
      status: apiUser.is_approved ? "approved" : "pending",
      initials,
      token,
    };
  }, []);

  const refreshAccessStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/access/status?user_id=${encodeURIComponent(user.id)}`);
      if (res.ok) {
        const data = await res.json();
        const isApproved = user.role === "manager" ? true : Boolean(data.is_approved);
        const lobbyAccess =
          user.role === "manager"
            ? true
            : typeof data.lobby_access === "boolean"
            ? data.lobby_access
            : isApproved;
        const status = data.grant?.status || (isApproved ? "approved" : "pending");
        setUser((prev) => {
          const updated = { ...prev, isApproved, lobbyAccess, status };
          try {
            localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }
    } catch (e) {
      console.warn("Failed to refresh access status:", e);
    }
  }, [user.id, user.role]);

  const loginWithCredentials = useCallback(
    async (identifier: string, password: string) => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier,
            email: identifier,
            username: identifier,
            password,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data.detail || "Invalid username/email or password" };
        }
        const nextAccount = mapBackendUserToAccount(data.user, data.access_token);
        saveUser(nextAccount);
        setLoginModalOpen(false);
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e.message || "Login failed" };
      }
    },
    [mapBackendUserToAccount, saveUser]
  );

  const createAccountWithUsername = useCallback(
    async (params: {
      username: string;
      email: string;
      password: string;
      name: string;
      role: SecurityRole;
      department: string;
      brand_id?: string;
      pin_code?: string;
    }) => {
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...params,
            require_pin: false,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data.detail || "Failed to create account" };
        }
        const nextAccount = mapBackendUserToAccount(data.user, data.access_token);
        saveUser(nextAccount);
        setLoginModalOpen(false);
        return { ok: true, user: nextAccount };
      } catch (e: any) {
        return { ok: false, error: e.message || "Registration failed" };
      }
    },
    [mapBackendUserToAccount, saveUser]
  );

  const resetPasswordInDb = useCallback(
    async (identifier: string, newPassword: string) => {
      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier,
            new_password: newPassword,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data.detail || "Could not reset password" };
        }
        if (data.user) {
          const nextAccount = mapBackendUserToAccount(data.user, data.access_token);
          saveUser(nextAccount);
        }
        return { ok: true, message: data.message };
      } catch (e: any) {
        return { ok: false, error: e.message || "Password reset failed" };
      }
    },
    [mapBackendUserToAccount, saveUser]
  );

  const loginAs = useCallback(
    async (key: PresetUserKey) => {
      const selected = PRESET_USERS[key];
      if (!selected) return;
      const defaultPass = key === "vedant_admin" ? "Ashu@1285" : "demo123";
      const result = await loginWithCredentials(selected.email, defaultPass);
      if (!result.ok) {
        saveUser(selected);
        setLoginModalOpen(false);
      }
    },
    [loginWithCredentials, saveUser]
  );

  const registerWithPin = useCallback(
    async (params: {
      username?: string;
      name: string;
      email: string;
      password: string;
      pin_code: string;
      department: string;
    }) => {
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...params,
            role: "CREATOR",
            require_pin: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data.detail || "PIN verification failed" };
        }
        const nextAccount = mapBackendUserToAccount(data.user, data.access_token);
        saveUser(nextAccount);
        setLoginModalOpen(false);
        return { ok: true, brand_name: data.user?.brand_name };
      } catch (e: any) {
        return { ok: false, error: e.message || "Registration failed" };
      }
    },
    [mapBackendUserToAccount, saveUser]
  );

  const requestOtp = useCallback(async (email: string) => {
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.detail || "Failed to generate OTP" };
      return { ok: true, otp_code: data.otp_code };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }, []);

  const verifyOtp = useCallback(
    async (email: string, code: string) => {
      try {
        const res = await fetch("/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", email, code }),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.detail || "Invalid OTP code" };
        if (data.user) {
          const nextAccount = mapBackendUserToAccount(data.user, data.access_token);
          saveUser(nextAccount);
          setLoginModalOpen(false);
        }
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
    },
    [mapBackendUserToAccount, saveUser]
  );

  const loginCustom = useCallback(
    (email: string, name: string, role: AppUserRole, department: string) => {
      const isManager = role === "manager";
      const id = `user_${Date.now().toString(36)}`;
      const initials =
        name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2) || "U";

      const newUser: UserAccount = {
        id,
        username: email.split("@")[0],
        name,
        email,
        role,
        securityRole: isManager ? "ADMIN" : "CREATOR",
        roleLabel: isManager ? "Brand Governance Manager" : "Content Creator",
        department,
        brand_id: "b0000001-0000-4000-8000-000000000001",
        brand_name: "EcoFresh Botanicals",
        isApproved: isManager,
        lobbyAccess: isManager,
        status: isManager ? "approved" : "pending",
        initials,
      };

      saveUser(newUser);
      setLoginModalOpen(false);
    },
    [saveUser]
  );

  const requestAccess = useCallback(async () => {
    try {
      await fetch("/api/access/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          email: user.email,
          department: user.department,
          role: user.role,
        }),
      });
      setUser((prev) => ({ ...prev, status: "pending", isApproved: false }));
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isManager: user.role === "manager",
        isAdmin: user.securityRole === "ADMIN",
        loginAs,
        loginWithCredentials,
        createAccountWithUsername,
        resetPasswordInDb,
        registerWithPin,
        requestOtp,
        verifyOtp,
        loginCustom,
        requestAccess,
        loginModalOpen,
        setLoginModalOpen,
        refreshAccessStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
