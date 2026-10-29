"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  auth,
  testFirestoreConnection,
  onAuthStateChanged,
  loadCrossDeviceProfileFromFirestore,
  syncAccountToFirestore,
  signInWithGoogleCrossDevice,
  signOutFromFirebase,
} from "@/lib/firebase-client";

export type AppUserRole = "manager" | "content_creator";
export type SecurityRole = "SUPER_ADMIN" | "ADMIN" | "REVIEWER" | "CREATOR";

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

const DEFAULT_GUEST_USER: UserAccount = {
  id: "",
  username: "",
  name: "Workspace User",
  email: "",
  role: "content_creator",
  securityRole: "CREATOR",
  roleLabel: "Not Signed In",
  department: "Marketing",
  brand_id: "b0000001-0000-4000-8000-000000000001",
  brand_name: "EcoFresh Botanicals",
  isApproved: false,
  lobbyAccess: false,
  status: "pending",
  initials: "WU",
};

interface AuthContextValue {
  user: UserAccount;
  isAuthenticated: boolean;
  cloudSynced: boolean;
  isManager: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loginWithGoogleCrossDevice: (preferredRole?: SecurityRole) => Promise<{
    ok: boolean;
    error?: string;
    user?: UserAccount;
  }>;
  loginWithCredentials: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  createAccountWithUsername: (params: {
    username: string;
    email: string;
    password: string;
    name: string;
    role: SecurityRole;
    department: string;
    brand_id?: string;
    brand_name?: string;
    workspace_name?: string;
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
  logout: () => void;
  requestAccess: () => Promise<void>;
  loginModalOpen: boolean;
  setLoginModalOpen: (open: boolean) => void;
  refreshAccessStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_AUTH_KEY = "brandlens.auth.user.v6";
const STORAGE_AUTH_ACTIVE_KEY = "brandlens.auth.authenticated.v3";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAccount>(DEFAULT_GUEST_USER);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [cloudSynced, setCloudSynced] = useState<boolean>(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // Restore saved session only if explicitly authenticated
  useEffect(() => {
    void testFirestoreConnection();
    try {
      const storedAuth = localStorage.getItem(STORAGE_AUTH_ACTIVE_KEY);
      const stored = localStorage.getItem(STORAGE_AUTH_KEY);
      if (stored && storedAuth === "true") {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.id && parsed.email) {
          setUser(parsed);
          setIsAuthenticated(true);
        }
      }
    } catch {}
  }, []);

  const saveUser = useCallback((nextUser: UserAccount) => {
    setUser(nextUser);
    setIsAuthenticated(true);
    try {
      localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(nextUser));
      localStorage.setItem(STORAGE_AUTH_ACTIVE_KEY, "true");
    } catch {}
    if (auth.currentUser) {
      void syncAccountToFirestore(nextUser).then((ok) => {
        if (ok) setCloudSynced(true);
      });
    }
  }, []);

  const logout = useCallback(() => {
    setUser(DEFAULT_GUEST_USER);
    setIsAuthenticated(false);
    setCloudSynced(false);
    void signOutFromFirebase();
    try {
      localStorage.removeItem(STORAGE_AUTH_KEY);
      localStorage.removeItem(STORAGE_AUTH_ACTIVE_KEY);
    } catch {}
  }, []);

  const mapBackendUserToAccount = useCallback((apiUser: any, token?: string): UserAccount => {
    const appRole: AppUserRole =
      apiUser.role === "SUPER_ADMIN" ||
      apiUser.role === "ADMIN" ||
      apiUser.role === "REVIEWER" ||
      apiUser.app_role === "manager"
        ? "manager"
        : "content_creator";
    const initials = (apiUser.name || apiUser.username || apiUser.email || "U")
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const isSuper = apiUser.role === "SUPER_ADMIN";

    const roleLabel = isSuper
      ? "Super Admin"
      : apiUser.role === "ADMIN"
      ? "Workspace Admin (ADMIN)"
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
      brand_name: apiUser.brand_name || "Default Workspace",
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
    if (!user.id) return;
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
      brand_name?: string;
      workspace_name?: string;
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
    if (!user.id) return;
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

  const loginWithGoogleCrossDevice = useCallback(
    async (preferredRole?: SecurityRole) => {
      try {
        const { firebaseUser, cloudProfile } = await signInWithGoogleCrossDevice();
        const email = firebaseUser.email || "";
        const resolvedRole: SecurityRole =
          cloudProfile?.role || preferredRole || "CREATOR";

        const syncRes = await fetch("/api/auth/cloud-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: firebaseUser.uid,
            email,
            username:
              cloudProfile?.username ||
              email.split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "_"),
            name:
              cloudProfile?.name ||
              firebaseUser.displayName ||
              email.split("@")[0],
            role: resolvedRole,
            department: cloudProfile?.department || "Marketing",
            brand_id:
              cloudProfile?.brand_id ||
              "b0000001-0000-4000-8000-000000000001",
            is_approved: cloudProfile?.is_approved ?? true,
            lobby_access: cloudProfile?.lobby_access ?? true,
          }),
        });

        const syncData = await syncRes.json();
        const nextAccount = syncRes.ok
          ? mapBackendUserToAccount(syncData.user, syncData.access_token)
          : mapBackendUserToAccount({
              id: firebaseUser.uid,
              username:
                cloudProfile?.username || email.split("@")[0] || "user",
              email,
              name:
                cloudProfile?.name ||
                firebaseUser.displayName ||
                "Workspace User",
              role: resolvedRole,
              brand_id:
                cloudProfile?.brand_id ||
                "b0000001-0000-4000-8000-000000000001",
              brand_name: cloudProfile?.brand_name || "EcoFresh Botanicals",
              department: cloudProfile?.department || "Marketing",
              is_approved: true,
              lobby_access: true,
            });

        saveUser(nextAccount);
        const synced = await syncAccountToFirestore(nextAccount);
        setCloudSynced(synced);
        setLoginModalOpen(false);
        return { ok: true, user: nextAccount };
      } catch (err: any) {
        return {
          ok: false,
          error: err?.message || "Google cross-device sign-in failed",
        };
      }
    },
    [mapBackendUserToAccount, saveUser]
  );

  // Automatically restore cross-device Firestore account when Firebase Auth is active on any device
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser || !fbUser.emailVerified) {
        setCloudSynced(false);
        return;
      }
      const cloudProfile = await loadCrossDeviceProfileFromFirestore(fbUser);
      if (cloudProfile) {
        try {
          const syncRes = await fetch("/api/auth/cloud-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              uid: fbUser.uid,
              email: cloudProfile.email,
              username: cloudProfile.username,
              name: cloudProfile.name,
              role: cloudProfile.role,
              department: cloudProfile.department,
              brand_id: cloudProfile.brand_id,
              is_approved: cloudProfile.is_approved,
              lobby_access: cloudProfile.lobby_access,
            }),
          });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            const restored = mapBackendUserToAccount(
              syncData.user,
              syncData.access_token
            );
            setUser(restored);
            setIsAuthenticated(true);
            setCloudSynced(true);
            try {
              localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(restored));
              localStorage.setItem(STORAGE_AUTH_ACTIVE_KEY, "true");
            } catch {}
          }
        } catch {}
      }
    });
    return () => unsubscribe();
  }, [mapBackendUserToAccount]);

  const isSuperAdmin = user.securityRole === "SUPER_ADMIN";
  const isAdmin =
    user.securityRole === "ADMIN" || user.securityRole === "SUPER_ADMIN";

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        cloudSynced,
        isManager: user.role === "manager",
        isAdmin,
        isSuperAdmin,
        loginWithGoogleCrossDevice,
        loginWithCredentials,
        createAccountWithUsername,
        resetPasswordInDb,
        registerWithPin,
        requestOtp,
        verifyOtp,
        loginCustom,
        logout,
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
