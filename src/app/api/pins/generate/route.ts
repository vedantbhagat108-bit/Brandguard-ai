import { NextRequest, NextResponse } from 'next/server';
import {
  securityDB,
  decodeAccessToken,
  DBUserRecord,
} from '@/backend/database.ts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await securityDB.syncFromCloud(true);
    const body = await req.json().catch(() => ({}));
    const { brand_id, prefix = 'PIN' } = body;

    let adminUser: DBUserRecord | undefined;

    // 1. Check Bearer Token (matching security_deps.py)
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      try {
        const payload = decodeAccessToken(authHeader.slice(7).trim());
        adminUser = securityDB.findUserByIdOrIdentifier(payload.sub);
      } catch {
        return NextResponse.json(
          { detail: 'Could not validate authentication credentials or token has expired' },
          { status: 401 }
        );
      }
    } else {
      // Fallback to header role/id for seamless UI integration
      const roleHeader = (
        req.headers.get('x-security-role') ||
        req.headers.get('x-user-role') ||
        ''
      ).toUpperCase();
      const userIdHeader = req.headers.get('x-user-id');
      if (userIdHeader) {
        adminUser = securityDB.findUserByIdOrIdentifier(userIdHeader);
      }
      if (!adminUser) {
        if (
          roleHeader === 'SUPER_ADMIN' ||
          roleHeader === 'ADMIN' ||
          roleHeader === 'MANAGER'
        ) {
          adminUser = securityDB.findUserByEmail('admin@gmail.com');
        } else if (roleHeader) {
          return NextResponse.json(
            { detail: `Access denied: Operation requires ADMIN or SUPER_ADMIN role. Current role: ${roleHeader}` },
            { status: 403 }
          );
        } else {
          adminUser = securityDB.findUserByEmail('admin@gmail.com');
        }
      }
    }

    if (!adminUser || (adminUser.role !== 'ADMIN' && adminUser.role !== 'SUPER_ADMIN')) {
      return NextResponse.json(
        {
          detail: `Access denied: Operation requires ADMIN or SUPER_ADMIN role. Current role: ${adminUser?.role || 'CREATOR'}`,
        },
        { status: 403 }
      );
    }

    const newPin = securityDB.generatePin({
      adminUser,
      brandId: brand_id,
      prefix,
    });

    await securityDB.saveToCloud();

    return NextResponse.json(
      {
        pin_code: newPin.pin_code,
        expires_at: newPin.expires_at,
        brand_id: newPin.brand_id,
        version: newPin.version || 1,
        updated_at: newPin.updated_at || newPin.created_at,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || 'PIN generation failed' },
      { status: err.status || 403 }
    );
  }
}
