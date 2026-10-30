import { NextRequest, NextResponse } from 'next/server';
import { requestOtp, verifyOtp } from '@/backend/lobby.ts';
import {
  securityDB,
  createAccessToken,
  hashPassword,
  DBUserRecord,
} from '@/backend/database.ts';
import { pinIpLimiter, RateLimitError } from '@/backend/rateLimiter.ts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await securityDB.syncFromCloud(true);
    const body = await req.json();
    const { action = 'request', email, otp, code, role = 'content_creator' } = body;
    const otpValue = otp || code;

    if (!email || !email.trim()) {
      return NextResponse.json({ detail: 'Email is required.' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (action === 'request') {
      const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
      const bearerToken =
        authHeader && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : null;
      const result = await requestOtp(cleanEmail, role, {
        googleAccessToken: body.google_access_token || bearerToken,
      });
      return NextResponse.json(result);
    }

    if (action === 'verify') {
      pinIpLimiter.checkRateLimit(req);

      if (!otpValue) {
        return NextResponse.json({ detail: 'OTP code is required.' }, { status: 400 });
      }
      const verified = verifyOtp(cleanEmail, otpValue);

      // Find or create user in securityDB
      let dbUser: DBUserRecord | undefined = securityDB.findUserByEmail(cleanEmail);
      const nowIso = new Date().toISOString();
      if (!dbUser) {
        const defaultBrandId = 'b0000001-0000-4000-8000-000000000001';
        const newDbUser: DBUserRecord = {
          id: verified.user.user_id,
          username: cleanEmail.split('@')[0],
          email: cleanEmail,
          hashed_password: hashPassword('otp-verified'),
          role: role === 'manager' || role === 'admin' ? 'ADMIN' : 'CREATOR',
          brand_id: defaultBrandId,
          brand_name: 'Default Workspace',
          name: cleanEmail.split('@')[0],
          department: 'Marketing',
          is_approved: true,
          lobby_access: true,
          created_at: nowIso,
          updated_at: nowIso,
          version: 1,
        };
        securityDB.users.set(newDbUser.id, newDbUser);
        securityDB.saveToDisk();
        dbUser = newDbUser;
      }

      const jwtToken = createAccessToken({
        sub: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        role: dbUser.role,
        brand_id: dbUser.brand_id,
      });

      securityDB.logAudit({
        brand_id: dbUser.brand_id,
        user_id: dbUser.id,
        user_email: dbUser.email,
        action: 'OTP_VERIFIED',
        details: { username: dbUser.username, email: dbUser.email, role: dbUser.role },
      });

      await securityDB.saveToCloud();

      const workspace = securityDB.workspaces.get(dbUser.brand_id);

      return NextResponse.json({
        success: true,
        access_token: jwtToken,
        token_type: 'bearer',
        user: {
          id: dbUser.id,
          username: dbUser.username,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
          brand_id: dbUser.brand_id,
          brand_name: dbUser.brand_name || workspace?.name || 'Default Workspace',
          department: dbUser.department,
          is_approved: dbUser.is_approved,
          lobby_access: typeof dbUser.lobby_access === 'boolean' ? dbUser.lobby_access : true,
          version: dbUser.version || 1,
          updated_at: dbUser.updated_at || dbUser.created_at,
        },
      });
    }

    return NextResponse.json({ detail: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { detail: err.message },
        { status: 429, headers: err.headers }
      );
    }
    return NextResponse.json(
      { detail: err.message || 'OTP operation failed' },
      { status: 400 }
    );
  }
}
