import { NextRequest, NextResponse } from 'next/server';
import { getAccessStatus } from '@/backend/accessControl.ts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id') || req.headers.get('x-user-id') || 'creator-1';
  return NextResponse.json(getAccessStatus(userId));
}
