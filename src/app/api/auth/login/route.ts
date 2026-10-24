import { NextRequest, NextResponse } from 'next/server';
import {
  securityDB,
  verifyPassword,
  createAccessToken,
} from '@/backend/database.ts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { identifier, email, username, password } = body;
    const loginId = (identifier || username || email || '').trim();

    if (!loginId || !password) {
      return NextResponse.json(
        { detail: 'Username/Email and password are required.' },
        { status: 400 }
      );
    }

    const user = securityDB.findUserByUsernameOrEmail(loginId);

    if (!user || !verifyPassword(password, user.hashed_password)) {
      return NextResponse.json(
        { detail: 'Invalid username/email or password.' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
      );
    }

    const token = createAccessToken({
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      brand_id: user.brand_id,
    });

    securityDB.logAudit({
      brand_id: user.brand_id,
      user_id: user.id,
      user_email: user.email,
      action: 'USER_LOGIN',
      details: { username: user.username, email: user.email, role: user.role },
    });

    const workspace = securityDB.workspaces.get(user.brand_id);

    return NextResponse.json({
      access_token: token,
      token_type: 'bearer',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        brand_id: user.brand_id,
        brand_name: workspace?.name || 'EcoFresh Botanicals',
        department: user.department,
        is_approved: user.is_approved,
        lobby_access: typeof user.lobby_access === 'boolean' ? user.lobby_access : true,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || 'Authentication failed' },
      { status: 500 }
    );
  }
}
