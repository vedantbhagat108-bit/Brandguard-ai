import { NextRequest, NextResponse } from 'next/server';
import { securityDB, createAccessToken } from '@/backend/database.ts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { identifier, username, email, new_password } = body;
    const targetId = (identifier || username || email || '').trim();

    if (!targetId || !new_password) {
      return NextResponse.json(
        { detail: 'Username/Email and new password are required.' },
        { status: 400 }
      );
    }

    const updatedUser = securityDB.resetUserPassword(targetId, new_password);
    const workspace = securityDB.workspaces.get(updatedUser.brand_id);

    const token = createAccessToken({
      sub: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role,
      brand_id: updatedUser.brand_id,
    });

    return NextResponse.json({
      success: true,
      message: `Password for "${updatedUser.username}" (${updatedUser.email}) has been updated in the database.`,
      access_token: token,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        brand_id: updatedUser.brand_id,
        brand_name: workspace?.name || 'EcoFresh Botanicals',
        department: updatedUser.department,
        is_approved: updatedUser.is_approved,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || 'Password reset failed' },
      { status: err.status || 400 }
    );
  }
}
