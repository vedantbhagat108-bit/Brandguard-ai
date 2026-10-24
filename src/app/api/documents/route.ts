import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/backend/store.ts';
import { checkUserDatabaseAccess } from '@/backend/accessControl.ts';
import { UserRole } from '@/backend/types.ts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const callerRole = (req.headers.get('x-user-role') as UserRole) || 'content_creator';
  const callerId = req.headers.get('x-user-id') || 'creator-1';

  const access = checkUserDatabaseAccess(callerId, callerRole);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.message || 'Database access not granted by manager.', status: access.status, access_required: true },
      { status: 403 }
    );
  }

  return NextResponse.json(store.listDocuments());
}
