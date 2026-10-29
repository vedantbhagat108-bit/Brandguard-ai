import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  securityDB,
  hashPassword,
  createAccessToken,
  DBRole,
  DBUserRecord,
} from '@/backend/database.ts';
import { requestDatabaseAccess, updateAccessGrant } from '@/backend/accessControl.ts';
import { pinIpLimiter, RateLimitError } from '@/backend/rateLimiter.ts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      username,
      email,
      password,
      name,
      brand_id = 'b0000001-0000-4000-8000-000000000001',
      brand_name,
      workspace_name,
      role = 'CREATOR',
      pin_code,
      require_pin = false,
      department = 'Marketing',
    } = body;

    if (!password || password.length < 4) {
      return NextResponse.json(
        { detail: 'Password (minimum 4 characters) is required.' },
        { status: 400 }
      );
    }

    const cleanUsername = (
      username ||
      (email ? email.split('@')[0] : '') ||
      name?.toLowerCase().replace(/\s+/g, '_') ||
      ''
    )
      .trim()
      .toLowerCase();

    const normalizedEmail = (
      email || `${cleanUsername}@workspace.local`
    )
      .trim()
      .toLowerCase();

    if (!cleanUsername) {
      return NextResponse.json(
        { detail: 'Username or email is required.' },
        { status: 400 }
      );
    }

    if (securityDB.findUserByUsername(cleanUsername)) {
      return NextResponse.json(
        { detail: `Username "${cleanUsername}" is already taken. Try another username.` },
        { status: 400 }
      );
    }

    if (securityDB.findUserByEmail(normalizedEmail)) {
      return NextResponse.json(
        { detail: `Email "${normalizedEmail}" is already registered.` },
        { status: 400 }
      );
    }

    const customWorkspaceName = (workspace_name || brand_name || '').trim();
    let workspace = securityDB.getOrCreateWorkspaceByName(customWorkspaceName, brand_id);

    let pinVerified = false;
    if (pin_code && pin_code.trim()) {
      try {
        pinIpLimiter.checkRateLimit(req);
        const burnedPin = securityDB.verifyAndBurnPin({
          pin_code: pin_code.trim(),
          user_email: normalizedEmail,
        });
        pinVerified = true;
        const pinWs = securityDB.workspaces.get(burnedPin.brand_id);
        if (pinWs) workspace = pinWs;
      } catch (pinErr: any) {
        if (pinErr instanceof RateLimitError) {
          return NextResponse.json(
            { detail: pinErr.message },
            { status: 429, headers: pinErr.headers }
          );
        }
        return NextResponse.json(
          { detail: pinErr.message },
          { status: pinErr.status || 403 }
        );
      }
    } else if (require_pin) {
      return NextResponse.json(
        { detail: 'A valid single-use BrandPIN is required for PIN onboarding.' },
        { status: 400 }
      );
    }

    const userId = crypto.randomUUID();
    const displayName =
      name?.trim() ||
      cleanUsername
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, (l: string) => l.toUpperCase());

    // Disallow self-registration as SUPER_ADMIN (Super Admin is pre-provisioned as admin@gmail.com)
    const normalizedRole: DBRole = ['ADMIN', 'REVIEWER', 'CREATOR'].includes(role)
      ? (role as DBRole)
      : role === 'manager'
      ? 'ADMIN'
      : 'CREATOR';

    const isApproved =
      normalizedRole === 'ADMIN' ||
      normalizedRole === 'REVIEWER' ||
      pinVerified ||
      !require_pin;

    const newUser: DBUserRecord = {
      id: userId,
      username: cleanUsername,
      email: normalizedEmail,
      hashed_password: hashPassword(password),
      role: normalizedRole,
      brand_id: workspace.id,
      brand_name: workspace.name,
      name: displayName,
      department,
      is_approved: isApproved,
      lobby_access: isApproved,
      created_at: new Date().toISOString(),
    };

    securityDB.users.set(newUser.id, newUser);
    securityDB.saveToDisk();

    // Sync with access control registry
    requestDatabaseAccess({
      user_id: newUser.id,
      email: newUser.email,
      department,
      role: newUser.role === 'CREATOR' ? 'content_creator' : 'manager',
    });
    if (isApproved) {
      updateAccessGrant({
        manager_id: pinVerified ? 'system-pin-burn' : 'self-registered',
        manager_role: 'admin',
        target_user_id: newUser.id,
        action: 'approve',
        department,
      });
      updateAccessGrant({
        manager_id: pinVerified ? 'system-pin-burn' : 'self-registered',
        manager_role: 'admin',
        target_user_id: newUser.id,
        action: 'grant_lobby',
        department,
      });
    }

    securityDB.logAudit({
      brand_id: workspace.id,
      user_id: newUser.id,
      user_email: newUser.email,
      action: 'USER_REGISTERED',
      details: {
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        redeemed_pin: pin_code || 'Direct Account Signup',
        brand: workspace.name,
      },
    });

    const token = createAccessToken({
      sub: newUser.id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      brand_id: newUser.brand_id,
    });

    return NextResponse.json(
      {
        access_token: token,
        token_type: 'bearer',
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          brand_id: newUser.brand_id,
          brand_name: workspace.name,
          department: newUser.department,
          is_approved: newUser.is_approved,
          lobby_access: newUser.lobby_access,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || 'Registration failed' },
      { status: 500 }
    );
  }
}
