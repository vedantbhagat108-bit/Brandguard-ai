import { NextRequest, NextResponse } from 'next/server';
import { analyzeContent } from '@/backend/analyze.ts';
import { checkUserDatabaseAccess } from '@/backend/accessControl.ts';
import { UserRole, ConfidentialityLevel } from '@/backend/types.ts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Malformed or empty JSON request body.' },
        { status: 400 }
      );
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be a JSON object.' },
        { status: 400 }
      );
    }
    const {
      content,
      content_draft,
      text,
      department = 'marketing',
      confidentiality = 'internal',
      top_k = 5,
    } = body;

    const rawContent = (content || content_draft || text || '').trim();

    const callerRole = (req.headers.get('x-user-role') as UserRole) || 'content_creator';
    const callerId = req.headers.get('x-user-id') || 'creator-1';

    const access = checkUserDatabaseAccess(callerId, callerRole);
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.message || 'Database access not granted by manager.', status: access.status, access_required: true },
        { status: 403 }
      );
    }

    if (!rawContent) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const result = await analyzeContent(
      rawContent,
      department,
      confidentiality as ConfidentialityLevel,
      callerRole,
      Number(top_k)
    );

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Analysis failed' }, { status: 500 });
  }
}
