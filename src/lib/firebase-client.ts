"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocFromServer,
  serverTimestamp,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import type { UserAccount, SecurityRole } from "@/components/providers/auth-provider";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionTested = false;

export async function testFirestoreConnection(): Promise<void> {
  if (typeof window === "undefined" || connectionTested) return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

function sanitizeUsername(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 60);
  if (cleaned.length >= 2) return cleaned;
  return `user_${Math.random().toString(36).slice(2, 8)}`;
}

export async function syncAccountToFirestore(
  account: UserAccount
): Promise<boolean> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) {
    return false;
  }

  const uid = fbUser.uid;
  const userPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/info`;

  const validRole: "ADMIN" | "REVIEWER" | "CREATOR" =
    account.securityRole === "SUPER_ADMIN" || account.securityRole === "ADMIN"
      ? "ADMIN"
      : account.securityRole === "REVIEWER"
      ? "REVIEWER"
      : "CREATOR";

  const isBootstrappedAdmin =
    fbUser.email === "ash258296@gmail.com" && fbUser.emailVerified;

  const publicData = {
    userId: uid,
    ownerUid: uid,
    username: sanitizeUsername(
      account.username || account.email.split("@")[0] || "brand_user"
    ),
    name: (account.name || fbUser.displayName || "Workspace User").slice(0, 100),
    role: validRole,
    department: (account.department || "Marketing").slice(0, 80),
    brand_id: (
      account.brand_id || "b0000001-0000-4000-8000-000000000001"
    ).slice(0, 64),
    brand_name: (account.brand_name || "EcoFresh Botanicals").slice(0, 100),
    is_approved: Boolean(account.isApproved),
    lobby_access: Boolean(account.lobbyAccess ?? account.isApproved),
  };

  try {
    const userRef = doc(db, "users", uid);
    let existingSnap;
    try {
      existingSnap = await getDoc(userRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, userPath);
    }

    if (existingSnap && existingSnap.exists()) {
      const existingData = existingSnap.data();
      try {
        if (isBootstrappedAdmin) {
          await updateDoc(userRef, {
            ...publicData,
            userId: existingData.userId || uid,
            ownerUid: existingData.ownerUid || uid,
            createdAt: existingData.createdAt,
            updatedAt: serverTimestamp(),
          });
        } else {
          // Non-admin owners can only update profile metadata per Firestore security rules;
          // role, is_approved, and lobby_access are strictly governed by Super Admin.
          await updateDoc(userRef, {
            name: publicData.name,
            department: publicData.department,
            brand_name: publicData.brand_name,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    } else {
      try {
        await setDoc(userRef, {
          ...publicData,
          role: isBootstrappedAdmin ? validRole : "CREATOR",
          is_approved: isBootstrappedAdmin ? publicData.is_approved : false,
          lobby_access: isBootstrappedAdmin ? publicData.lobby_access : false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, userPath);
      }
    }

    const privateRef = doc(db, "users", uid, "private", "info");
    let existingPriv;
    try {
      existingPriv = await getDoc(privateRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, privatePath);
    }

    const safeEmail = (fbUser.email || account.email).slice(0, 160);
    if (existingPriv && existingPriv.exists()) {
      const privData = existingPriv.data();
      try {
        await updateDoc(privateRef, {
          uid,
          email: safeEmail,
          createdAt: privData.createdAt,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, privatePath);
      }
    } else {
      try {
        await setDoc(privateRef, {
          uid,
          email: safeEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, privatePath);
      }
    }

    return true;
  } catch (err) {
    console.warn("Cloud sync warning:", err);
    return false;
  }
}

export async function loadCrossDeviceProfileFromFirestore(
  fbUser: FirebaseUser
): Promise<{
  uid: string;
  username: string;
  name: string;
  email: string;
  role: SecurityRole;
  department: string;
  brand_id: string;
  brand_name: string;
  is_approved: boolean;
  lobby_access: boolean;
} | null> {
  const uid = fbUser.uid;
  const userPath = `users/${uid}`;
  const userRef = doc(db, "users", uid);

  try {
    let snap;
    try {
      snap = await getDoc(userRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, userPath);
    }

    if (snap && snap.exists()) {
      const data = snap.data();
      return {
        uid,
        username: data.username || fbUser.email?.split("@")[0] || "user",
        name: data.name || fbUser.displayName || "Workspace User",
        email: fbUser.email || "user@ecofresh.com",
        role: (data.role as SecurityRole) || "CREATOR",
        department: data.department || "Marketing",
        brand_id: data.brand_id || "b0000001-0000-4000-8000-000000000001",
        brand_name: data.brand_name || "EcoFresh Botanicals",
        is_approved: Boolean(data.is_approved),
        lobby_access: Boolean(data.lobby_access),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function signInWithGoogleCrossDevice(): Promise<{
  firebaseUser: FirebaseUser;
  cloudProfile: Awaited<ReturnType<typeof loadCrossDeviceProfileFromFirestore>>;
}> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(auth, provider);
  const cloudProfile = await loadCrossDeviceProfileFromFirestore(cred.user);
  return {
    firebaseUser: cred.user,
    cloudProfile,
  };
}

export async function signOutFromFirebase(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch {}
}

export async function deleteCrossDeviceProfileFromFirestore(uid: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const userRef = doc(db, "users", uid);
    const privateRef = doc(db, "users", uid, "private", "info");
    const adminRef = doc(db, "admins", uid);
    try {
      await deleteDoc(privateRef);
    } catch {}
    try {
      await deleteDoc(userRef);
    } catch {}
    try {
      await deleteDoc(adminRef);
    } catch {}
    return true;
  } catch (err) {
    console.warn("Could not delete cross device profile from Firestore:", err);
    return false;
  }
}

export { onAuthStateChanged, type FirebaseUser };
