import { NextRequest, NextResponse } from 'next/server';
import { securityDB, hashPassword, DBUserRecord } from '@/backend/database.ts';
import { pinIpLimiter, RateLimitError } from '@/backend/rateLimiter.ts';
import {
  requestDatabaseAccess,
  updateAccessGrant,
  getAccessStatus,
} from '@/backend/accessControl.ts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  securityDB.loadFromDisk();
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brand_id');

  // Deduplicate workspaces by id
  const uniqueWorkspacesMap = new Map<string, { id: string; name: string; brand_name: string; created_at: string }>();
  for (const ws of securityDB.workspaces.values()) {
    if (!uniqueWorkspacesMap.has(ws.id)) {
      uniqueWorkspacesMap.set(ws.id, {
        id: ws.id,
        name: ws.name,
        brand_name: ws.name,
        created_at: ws.created_at,
      });
    }
  }
  const workspaces = Array.from(uniqueWorkspacesMap.values());

  let pins = Array.from(securityDB.pins.values()).map((p) => ({
    ...p,
    brand_name: p.brand_name || securityDB.workspaces.get(p.brand_id)?.name || 'Default Workspace',
  }));

  let auditLogs = securityDB.auditLogs.map((log) => ({
    id: log.id,
    brand_id: log.brand_id,
    user_id: log.user_id || 'system',
    user_email: log.user_email || 'system@brandlens.ai',
    action: log.action,
    details: log.details_text || JSON.stringify(log.details),
    details_obj: log.details,
    ip_address: log.ip_address || '127.0.0.1',
    timestamp: log.timestamp,
  }));

  const users = Array.from(securityDB.users.values()).map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    role: u.role,
    brand_id: u.brand_id,
    brand_name: u.brand_name || securityDB.workspaces.get(u.brand_id)?.name || 'Default Workspace',
    department: u.department,
    is_approved: u.is_approved,
    lobby_access: typeof u.lobby_access === 'boolean' ? u.lobby_access : true,
    created_at: u.created_at,
    password_updated_at: u.password_updated_at || null,
    requested_role: u.requested_role || null,
    role_request_status: u.role_request_status || null,
    role_request_note: u.role_request_note || null,
    role_request_at: u.role_request_at || null,
  }));

  if (brandId) {
    pins = pins.filter((p) => p.brand_id === brandId);
    auditLogs = auditLogs.filter((a) => a.brand_id === brandId);
  }

  return NextResponse.json({
    workspaces,
    pins,
    users,
    audit_logs: auditLogs,
  });
}

export async function POST(req: NextRequest) {
  try {
    pinIpLimiter.checkRateLimit(req);

    const body = await req.json().catch(() => ({}));
    const { pin_code, brand_id, email, user_email, user_id } = body;
    const targetEmail = (
      email ||
      user_email ||
      req.headers.get('x-user-email') ||
      ''
    ).trim().toLowerCase();
    const targetUserId = (
      user_id ||
      body.userId ||
      req.headers.get('x-user-id') ||
      ''
    ).trim();

    if (!pin_code) {
      return NextResponse.json({ detail: 'pin_code is required.' }, { status: 400 });
    }

    const burned = securityDB.verifyAndBurnPin({
      pin_code,
      brand_id,
      user_email: targetEmail || 'verified_pin_user',
    });

    // Authorize & update user status in securityDB and accessControl
    let updatedUser: DBUserRecord | undefined;
    if (targetEmail || targetUserId) {
      updatedUser =
        (targetEmail ? securityDB.findUserByEmail(targetEmail) : undefined) ||
        (targetUserId ? securityDB.users.get(targetUserId) : undefined);

      if (!updatedUser && targetEmail) {
        updatedUser = {
          id: targetUserId || `usr_${Date.now()}`,
          username: targetEmail.split('@')[0],
          email: targetEmail,
          hashed_password: hashPassword('pin_session_user'),
          role: 'CREATOR',
          brand_id: burned.brand_id,
          brand_name: burned.brand_name,
          name: targetEmail.split('@')[0],
          department: 'Marketing',
          is_approved: true,
          lobby_access: true,
          created_at: new Date().toISOString(),
        };
        securityDB.users.set(updatedUser.id, updatedUser);
      } else if (updatedUser) {
        updatedUser.is_approved = true;
        updatedUser.lobby_access = true;
        updatedUser.brand_id = burned.brand_id;
        updatedUser.brand_name = burned.brand_name || updatedUser.brand_name;
        securityDB.users.set(updatedUser.id, updatedUser);
      }

      securityDB.saveToDisk();

      if (updatedUser) {
        requestDatabaseAccess({
          user_id: updatedUser.id,
          email: updatedUser.email,
          department: updatedUser.department,
          role: updatedUser.role === 'CREATOR' ? 'content_creator' : 'manager',
        });
        updateAccessGrant({
          manager_id: 'brand-pin-burn',
          manager_role: 'admin',
          target_user_id: updatedUser.id,
          action: 'approve',
          department: updatedUser.department,
        });
        updateAccessGrant({
          manager_id: 'brand-pin-burn',
          manager_role: 'admin',
          target_user_id: updatedUser.id,
          action: 'grant_lobby',
          department: updatedUser.department,
        });
      }
    }

    const accessStatus = updatedUser
      ? getAccessStatus(updatedUser.id, updatedUser.email)
      : null;

    return NextResponse.json({
      success: true,
      pin: burned,
      user: updatedUser
        ? {
            id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email,
            name: updatedUser.name,
            role: updatedUser.role,
            brand_id: updatedUser.brand_id,
            brand_name: updatedUser.brand_name,
            department: updatedUser.department,
            is_approved: updatedUser.is_approved,
            lobby_access: updatedUser.lobby_access,
          }
        : null,
      access_status: accessStatus,
      message: `BrandPIN ${burned.pin_code} verified. Workspace clearance authorized for ${burned.brand_name}.`,
    });
  } catch (err: any) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { detail: err.message },
        { status: 429, headers: err.headers }
      );
    }
    return NextResponse.json(
      { detail: err.message || 'PIN verification failed' },
      { status: err.status || 403 }
    );
  }
}
