"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
  deleteCrossDeviceProfileFromFirestore,
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
  requestedRole?: "ADMIN" | "REVIEWER" | "CREATOR" | null;
  roleRequestStatus?: "pending" | "approved" | "rejected" | null;
  roleRequestNote?: string | null;
  roleRequestAt?: string | null;
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
  brand_name: "Default Workspace",
  isApproved: true,
  lobbyAccess: true,
  status: "approved",
  initials: "WU",
  requestedRole: null,
  roleRequestStatus: null,
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
  requestRoleChange: (
    requestedRole: "ADMIN" | "REVIEWER" | "CREATOR",
    note?: string
  ) => Promise<{ ok: boolean; message?: string; error?: string }>;
  loginModalOpen: boolean;
  setLoginModalOpen: (open: boolean) => void;
  personalDashboardOpen: boolean;
  setPersonalDashboardOpen: (open: boolean) => void;
  refreshAccessStatus: () => Promise<void>;
  updateUserProfile: (params: {
    name?: string;
    department?: string;
    brand_name?: string;
  }) => Promise<{ ok: boolean; error?: string; user?: UserAccount }>;
  deleteUserHistory: (scope: "reviews" | "lobbies" | "all") => Promise<{
    ok: boolean;
    deleted?: { reviews: number; lobbies: number };
    error?: string;
  }>;
  deleteUserAccount: () => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_AUTH_KEY = "brandlens.auth.user.v6";
const STORAGE_AUTH_ACTIVE_KEY = "brandlens.auth.authenticated.v3";

function getRoleLabel(role?: string, isApproved: boolean = true): string {
  if (role === "SUPER_ADMIN") return "Super Admin";
  if (role === "ADMIN") return "Workspace Admin (ADMIN)";
  if (role === "REVIEWER") return "Compliance Manager (REVIEWER)";
  return isApproved ? "Content Creator (CREATOR)" : "Creator (Pending)";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAccount>(DEFAULT_GUEST_USER);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [cloudSynced, setCloudSynced] = useState<boolean>(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [personalDashboardOpen, setPersonalDashboardOpen] = useState(false);

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Restore saved session only if explicitly authenticated
  useEffect(() => {
    void testFirestoreConnection();
    try {
      const storedAuth = localStorage.getItem(STORAGE_AUTH_ACTIVE_KEY);
      const stored = localStorage.getItem(STORAGE_AUTH_KEY);
      if (stored && storedAuth === "true") {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.id && parsed.email) {
          setUser({
            ...parsed,
            lobbyAccess: typeof parsed.lobbyAccess === "boolean" ? parsed.lobbyAccess : true,
          });
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
    // Only sync to Firestore if the current Firebase user matches this account email!
    if (
      auth.currentUser &&
      auth.currentUser.email &&
      nextUser.email &&
      auth.currentUser.email.toLowerCase() === nextUser.email.toLowerCase()
    ) {
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
    const secRole: SecurityRole =
      apiUser.role === "SUPER_ADMIN" ||
      apiUser.role === "ADMIN" ||
      apiUser.role === "REVIEWER" ||
      apiUser.role === "CREATOR"
        ? apiUser.role
        : apiUser.app_role === "manager"
        ? "ADMIN"
        : "CREATOR";

    const appRole: AppUserRole =
      secRole === "SUPER_ADMIN" || secRole === "ADMIN" || secRole === "REVIEWER"
        ? "manager"
        : "content_creator";

    const initials = (apiUser.name || apiUser.username || apiUser.email || "U")
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const isApproved = apiUser.is_approved !== false;
    const roleLabel = getRoleLabel(secRole, isApproved);

    return {
      id: apiUser.id,
      username: apiUser.username || apiUser.email?.split("@")[0],
      name: apiUser.name || apiUser.username || apiUser.email,
      email: apiUser.email,
      role: appRole,
      securityRole: secRole,
      roleLabel,
      department: apiUser.department || "Marketing",
      brand_id: apiUser.brand_id,
      brand_name: apiUser.brand_name || "Default Workspace",
      isApproved,
      lobbyAccess:
        typeof apiUser.lobby_access === "boolean" ? apiUser.lobby_access : true,
      status: isApproved ? "approved" : "pending",
      initials,
      token,
      requestedRole: apiUser.requested_role || null,
      roleRequestStatus: apiUser.role_request_status || null,
      roleRequestNote: apiUser.role_request_note || null,
      roleRequestAt: apiUser.role_request_at || null,
    };
  }, []);

  const refreshAccessStatus = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser.id && !currentUser.email) return;
    const currentEmail = (currentUser.email || "").trim().toLowerCase();
    const isSuper = currentEmail === "admin@gmail.com";

    try {
      const qs = new URLSearchParams({
        user_id: currentUser.id || "",
        email: currentEmail,
      });
      const res = await fetch(`/api/access/status?${qs.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 410) {
        logout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data.deleted === true) {
          logout();
          return;
        }
        const apiUser = data.user;

        // If returned user email doesn't match active session email, NEVER overwrite the active session!
        if (
          apiUser &&
          currentEmail &&
          apiUser.email &&
          apiUser.email.toLowerCase() !== currentEmail
        ) {
          return;
        }

        const resolvedSecurityRole: SecurityRole = isSuper
          ? "SUPER_ADMIN"
          : (apiUser?.role as SecurityRole) ||
            (data.role as SecurityRole) ||
            currentUser.securityRole ||
            "CREATOR";

        const resolvedAppRole: AppUserRole =
          resolvedSecurityRole === "SUPER_ADMIN" ||
          resolvedSecurityRole === "ADMIN" ||
          resolvedSecurityRole === "REVIEWER"
            ? "manager"
            : "content_creator";

        const isApproved =
          resolvedAppRole === "manager" ? true : data.is_approved !== false;
        const lobbyAccess =
          resolvedSecurityRole === "SUPER_ADMIN"
            ? true
            : typeof data.lobby_access === "boolean"
            ? data.lobby_access
            : true;
        const status = data.grant?.status || (isApproved ? "approved" : "pending");
        const roleLabel = getRoleLabel(resolvedSecurityRole, isApproved);

        setUser((prev) => {
          // Double-check active account hasn't switched
          if (
            currentEmail &&
            prev.email &&
            prev.email.toLowerCase() !== currentEmail
          ) {
            return prev;
          }

          const targetId = apiUser?.id || prev.id;
          const targetUsername = apiUser?.username || prev.username;
          const targetName = apiUser?.name || prev.name;
          const targetBrandId = apiUser?.brand_id || prev.brand_id;
          const targetBrandName = apiUser?.brand_name || prev.brand_name;
          const targetDepartment = apiUser?.department || prev.department;
          const targetRequestedRole = apiUser?.requested_role ?? null;
          const targetRoleReqStatus = apiUser?.role_request_status ?? null;
          const targetRoleReqNote = apiUser?.role_request_note ?? null;
          const targetRoleReqAt = apiUser?.role_request_at ?? null;

          // Only trigger state update if an actual change occurred!
          const hasChange =
            prev.id !== targetId ||
            prev.username !== targetUsername ||
            prev.name !== targetName ||
            prev.role !== resolvedAppRole ||
            prev.securityRole !== resolvedSecurityRole ||
            prev.roleLabel !== roleLabel ||
            prev.brand_id !== targetBrandId ||
            prev.brand_name !== targetBrandName ||
            prev.department !== targetDepartment ||
            prev.isApproved !== isApproved ||
            prev.lobbyAccess !== lobbyAccess ||
            prev.status !== status ||
            prev.requestedRole !== targetRequestedRole ||
            prev.roleRequestStatus !== targetRoleReqStatus ||
            prev.roleRequestNote !== targetRoleReqNote ||
            prev.roleRequestAt !== targetRoleReqAt;

          if (!hasChange) {
            return prev;
          }

          const updated: UserAccount = {
            ...prev,
            id: targetId,
            username: targetUsername,
            name: targetName,
            role: resolvedAppRole,
            securityRole: resolvedSecurityRole,
            roleLabel,
            brand_id: targetBrandId,
            brand_name: targetBrandName,
            department: targetDepartment,
            isApproved,
            lobbyAccess,
            status,
            requestedRole: targetRequestedRole,
            roleRequestStatus: targetRoleReqStatus,
            roleRequestNote: targetRoleReqNote,
            roleRequestAt: targetRoleReqAt,
          };
          try {
            localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }
    } catch (e) {
      console.warn("Failed to refresh access status:", e);
    }
  }, []);

  // Real-time role & permission synchronization: poll on focus + interval (2s) + on custom event + cross-tab storage event
  useEffect(() => {
    if (!isAuthenticated || !user.email) return;

    void refreshAccessStatus();

    const interval = window.setInterval(() => {
      void refreshAccessStatus();
    }, 2000);

    const handleFocus = () => void refreshAccessStatus();
    const handleRoleEvent = () => void refreshAccessStatus();
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === STORAGE_AUTH_KEY || e.key === "brandlens-role-updated-ts") {
        void refreshAccessStatus();
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("brandlens-role-updated", handleRoleEvent);
    window.addEventListener("storage", handleStorageEvent);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("brandlens-role-updated", handleRoleEvent);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [isAuthenticated, user.email, refreshAccessStatus]);

  const requestRoleChange = useCallback(
    async (requestedRole: "ADMIN" | "REVIEWER" | "CREATOR", note?: string) => {
      if (!user.id && !user.email) {
        return { ok: false, error: "Sign in first to request a role change." };
      }
      try {
        const res = await fetch("/api/access/grant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": user.id,
            "X-Security-Role": user.securityRole || "CREATOR",
          },
          body: JSON.stringify({
            action: "request_role_change",
            target_user_id: user.id,
            email: user.email,
            name: user.name,
            requested_role: requestedRole,
            note,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            ok: false,
            error: data.error || "Could not submit role change request.",
          };
        }
        await refreshAccessStatus();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("brandlens-role-updated"));
        }
        return {
          ok: true,
          message:
            data.message ||
            `Requested role change to ${requestedRole} from Super Admin.`,
        };
      } catch (e: any) {
        return { ok: false, error: e.message || "Request failed" };
      }
    },
    [refreshAccessStatus, user.email, user.id, user.name, user.securityRole]
  );

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
        roleLabel: isManager ? "Workspace Admin (ADMIN)" : "Content Creator (CREATOR)",
        department,
        brand_id: "b0000001-0000-4000-8000-000000000001",
        brand_name: "Default Workspace",
        isApproved: true,
        lobbyAccess: true,
        status: "approved",
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
              brand_name: cloudProfile?.brand_name || "Default Workspace",
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

      // Safeguard: Check if another account (e.g. Super Admin) is actively signed in on this applet
      try {
        const stored = localStorage.getItem(STORAGE_AUTH_KEY);
        const storedAuth = localStorage.getItem(STORAGE_AUTH_ACTIVE_KEY);
        if (stored && storedAuth === "true") {
          const parsed = JSON.parse(stored);
          if (
            parsed?.email &&
            fbUser.email &&
            parsed.email.toLowerCase() !== fbUser.email.toLowerCase()
          ) {
            // Active session belongs to a different user (e.g. admin@gmail.com).
            // Do NOT overwrite it with the background Firebase Auth user!
            return;
          }
        }
      } catch {}

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
            }),
          });
          if (syncRes.status === 410) {
            // Account was deleted across devices! Clean up Firestore and sign out immediately.
            if (fbUser.uid) {
              void deleteCrossDeviceProfileFromFirestore(fbUser.uid);
            }
            void signOutFromFirebase();
            logout();
            return;
          }
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
  }, [logout, mapBackendUserToAccount]);

  const isSuperAdmin = user.securityRole === "SUPER_ADMIN";
  const isAdmin =
    user.securityRole === "ADMIN" || user.securityRole === "SUPER_ADMIN";

  const updateUserProfile = useCallback(
    async (params: { name?: string; department?: string; brand_name?: string }) => {
      if (!user.id && !user.email) {
        return { ok: false, error: "Must be signed in to update profile." };
      }
      try {
        const res = await fetch("/api/user/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            email: user.email,
            ...params,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data.error || "Failed to update profile." };
        }
        if (data.user) {
          const updatedName = data.user.name || user.name;
          const nextAccount: UserAccount = {
            ...user,
            name: updatedName,
            department: data.user.department || user.department,
            brand_name: data.user.brand_name || user.brand_name,
            initials: updatedName
              .split(" ")
              .map((n: string) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2),
          };
          saveUser(nextAccount);
          return { ok: true, user: nextAccount };
        }
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e.message || "Network error" };
      }
    },
    [saveUser, user]
  );

  const deleteUserHistory = useCallback(
    async (scope: "reviews" | "lobbies" | "all") => {
      if (!user.id && !user.email) {
        return { ok: false, error: "Must be signed in to clear history." };
      }
      try {
        const res = await fetch("/api/user/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete_history",
            userId: user.id,
            email: user.email,
            scope,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data.error || "Failed to clear history." };
        }
        return { ok: true, deleted: data.deleted };
      } catch (e: any) {
        return { ok: false, error: e.message || "Network error" };
      }
    },
    [user.email, user.id]
  );

  const deleteUserAccount = useCallback(async () => {
    if (!user.id && !user.email) {
      return { ok: false, error: "Must be signed in to delete account." };
    }
    try {
      // 1. Purge cross-device Firestore profile documents first
      if (auth.currentUser?.uid) {
        try {
          await deleteCrossDeviceProfileFromFirestore(auth.currentUser.uid);
        } catch (err) {
          console.warn("Could not delete Firebase UID doc:", err);
        }
      }
      if (user.id && user.id !== auth.currentUser?.uid) {
        try {
          await deleteCrossDeviceProfileFromFirestore(user.id);
        } catch (err) {
          console.warn("Could not delete user.id doc:", err);
        }
      }

      // 2. Call backend profile endpoint to delete account, purge lobby rooms, reviews, and add tombstone
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_account",
          userId: user.id,
          email: user.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || "Failed to delete account." };
      }

      // 3. Clean up Firebase Auth & local credentials
      try {
        await signOutFromFirebase();
      } catch {}

      try {
        localStorage.removeItem(STORAGE_AUTH_KEY);
        localStorage.removeItem(STORAGE_AUTH_ACTIVE_KEY);
      } catch {}

      logout();
      setPersonalDashboardOpen(false);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("brandlens-role-updated"));
        window.dispatchEvent(new Event("brandlens-account-deleted"));
      }

      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message || "Network error" };
    }
  }, [logout, user.email, user.id]);

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
        requestRoleChange,
        loginModalOpen,
        setLoginModalOpen,
        personalDashboardOpen,
        setPersonalDashboardOpen,
        refreshAccessStatus,
        updateUserProfile,
        deleteUserHistory,
        deleteUserAccount,
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
