import { NextRequest, NextResponse } from "next/server";
import {
  securityDB,
  hashPassword,
  createAccessToken,
  DBRole,
  DBUserRecord,
} from "@/backend/database.ts";
import {
  requestDatabaseAccess,
  updateAccessGrant,
} from "@/backend/accessControl.ts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    securityDB.loadFromDisk();
    const body = await req.json();
    const {
      uid,
      email,
      username,
      name,
      role = "CREATOR",
      department = "Marketing",
      brand_id = "b0000001-0000-4000-8000-000000000001",
      brand_name,
      workspace_name,
    } = body;

    if (!email) {
      return NextResponse.json(
        { detail: "Email is required for cloud synchronization." },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const cleanUsername = String(
      username || normalizedEmail.split("@")[0] || "cloud_user"
    )
      .trim()
      .toLowerCase();

    const workspace = securityDB.getOrCreateWorkspaceByName(
      workspace_name || brand_name,
      brand_id
    );

    const normalizedRole: DBRole =
      normalizedEmail === "admin@gmail.com"
        ? "SUPER_ADMIN"
        : ["ADMIN", "REVIEWER", "CREATOR"].includes(role)
        ? (role as DBRole)
        : "CREATOR";

    let existing =
      securityDB.findUserByEmail(normalizedEmail) ||
      (uid ? securityDB.users.get(String(uid)) : undefined);

    if (existing) {
      // Preserve authoritative role, approval, and lobby_access set by Super Admin in securityDB
      existing.name = name || existing.name;
      existing.department = department || existing.department;
      if (workspace_name || brand_name) {
        existing.brand_id = workspace.id;
        existing.brand_name = workspace.name;
      }
      if (existing.email.toLowerCase() === "admin@gmail.com") {
        existing.role = "SUPER_ADMIN";
      }
      if (typeof existing.lobby_access !== "boolean") {
        existing.lobby_access = true;
      }
      securityDB.users.set(existing.id, existing);
      securityDB.saveToDisk();
    } else {
      const userId = uid ? String(uid) : `cloud_${Date.now()}`;
      const newUser: DBUserRecord = {
        id: userId,
        username: cleanUsername,
        email: normalizedEmail,
        hashed_password: hashPassword(`cloud_oauth_${userId}`),
        role: normalizedRole,
        brand_id: workspace.id,
        brand_name: workspace.name,
        name: name || cleanUsername,
        department,
        is_approved: true,
        lobby_access: true,
        created_at: new Date().toISOString(),
      };
      securityDB.users.set(newUser.id, newUser);
      securityDB.saveToDisk();

      requestDatabaseAccess({
        user_id: newUser.id,
        email: newUser.email,
        department,
        role: newUser.role === "CREATOR" ? "content_creator" : "manager",
      });
      updateAccessGrant({
        manager_id: "firebase-cloud-sync",
        manager_role: "admin",
        target_user_id: newUser.id,
        action: "approve",
        department,
      });
      existing = newUser;
    }

    const token = createAccessToken({
      sub: existing.id,
      username: existing.username,
      email: existing.email,
      role: existing.role,
      brand_id: existing.brand_id,
    });

    const resolvedWorkspaceName =
      existing.brand_name ||
      securityDB.workspaces.get(existing.brand_id)?.name ||
      workspace.name;

    return NextResponse.json({
      access_token: token,
      token_type: "bearer",
      user: {
        id: existing.id,
        username: existing.username,
        email: existing.email,
        name: existing.name,
        role: existing.role,
        brand_id: existing.brand_id,
        brand_name: resolvedWorkspaceName,
        department: existing.department,
        is_approved: existing.is_approved,
        lobby_access: existing.lobby_access !== false,
        requested_role: existing.requested_role || null,
        role_request_status: existing.role_request_status || null,
        role_request_note: existing.role_request_note || null,
        role_request_at: existing.role_request_at || null,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || "Cloud sync failed" },
      { status: 500 }
    );
  }
}
