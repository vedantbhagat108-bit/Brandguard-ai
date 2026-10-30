import { NextRequest, NextResponse } from 'next/server';
import { getAccessStatus } from '@/backend/accessControl.ts';
import { securityDB } from '@/backend/database.ts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  await securityDB.syncFromCloud();
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id') || req.headers.get('x-user-id') || '';
  const email = searchParams.get('email') || req.headers.get('x-user-email') || '';
  return NextResponse.json(getAccessStatus(userId, email));
}
