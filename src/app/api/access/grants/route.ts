import { NextRequest, NextResponse } from 'next/server';
import { listAllGrants } from '@/backend/accessControl.ts';
import { UserRole } from '@/backend/types.ts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const callerRole = (req.headers.get('x-user-role') as UserRole) || 'manager';
    const grants = listAllGrants(callerRole);
    return NextResponse.json(grants);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
