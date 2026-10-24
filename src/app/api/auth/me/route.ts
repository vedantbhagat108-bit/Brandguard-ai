import { NextRequest, NextResponse } from 'next/server';
import { securityDB, decodeAccessToken } from '@/backend/database.ts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json(
        { detail: 'Not authenticated' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
      );
    }

    const token = authHeader.slice(7).trim();
    const payload = decodeAccessToken(token);
    const user = securityDB.users.get(payload.sub);

    if (!user) {
      return NextResponse.json(
        { detail: 'User associated with this token no longer exists' },
        { status: 401 }
      );
    }

    const workspace = securityDB.workspaces.get(user.brand_id);

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      brand_id: user.brand_id,
      brand_name: workspace?.name || 'EcoFresh Botanicals',
      department: user.department,
      is_approved: user.is_approved,
      created_at: user.created_at,
    });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || 'Could not validate authentication credentials' },
      { status: 401 }
    );
  }
}
