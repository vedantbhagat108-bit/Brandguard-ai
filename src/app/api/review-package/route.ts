import { NextRequest, NextResponse } from 'next/server';
import { generateReviewPackage } from '@/backend/reviewPackage.ts';
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
      title = 'Brand Governance Review',
      creator_id = 'creator-1',
      department = 'marketing',
      confidentiality = 'internal',
      top_k = 5,
    } = body;

    const callerRole = (req.headers.get('x-user-role') as UserRole) || 'content_creator';
    const callerId = req.headers.get('x-user-id') || creator_id;

    // Check Manager-Controlled Access Rights
    const access = checkUserDatabaseAccess(callerId, callerRole);
    if (!access.allowed) {
      return NextResponse.json(
        {
          error: access.message || 'Database access requires manager approval before running review.',
          status: access.status,
          access_required: true,
        },
        { status: 403 }
      );
    }

    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const pkg = await generateReviewPackage({
      content,
      title,
      creatorId: callerId,
      department,
      confidentiality: confidentiality as ConfidentialityLevel,
      callerRole,
      topK: Number(top_k),
    });

    return NextResponse.json(pkg);
  } catch (err: any) {
    console.error('Review package error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate review package' },
      { status: 500 }
    );
  }
}
