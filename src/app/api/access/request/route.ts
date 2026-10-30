import { NextRequest, NextResponse } from 'next/server';
import { requestDatabaseAccess } from '@/backend/accessControl.ts';
import { securityDB } from '@/backend/database.ts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await securityDB.syncFromCloud(true);
    const body = await req.json();
    const { user_id, email, department = 'marketing', role = 'content_creator' } = body;

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const grant = requestDatabaseAccess({
      user_id,
      email: email || `${user_id}@enterprise.com`,
      department,
      role,
    });

    await securityDB.saveToCloud();
    return NextResponse.json({ success: true, grant });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
