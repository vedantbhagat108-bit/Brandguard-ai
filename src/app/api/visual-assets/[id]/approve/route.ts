import { NextRequest, NextResponse } from 'next/server';
import { visualAssetsRag } from '@/backend/visualAssetsRag.ts';

export const runtime = 'nodejs';

const DEFAULT_ORG_ID = 'b0000001-0000-4000-8000-000000000001';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const organizationId =
      req.headers.get('x-organization-id') ||
      req.headers.get('x-brand-id') ||
      body.organization_id ||
      body.brand_id ||
      DEFAULT_ORG_ID;

    const actorRole =
      req.headers.get('x-security-role') ||
      req.headers.get('x-user-role') ||
      body.role ||
      'CREATOR';

    const actorName =
      req.headers.get('x-user-name') ||
      body.actor_name ||
      'Vedant Bhagat';

    const actorEmail =
      req.headers.get('x-user-email') ||
      body.actor_email ||
      'VedantBhagat@admin.in';

    const decision: 'approved' | 'rejected' =
      body.decision === 'rejected' ? 'rejected' : 'approved';

    const updated = visualAssetsRag.updateApprovalStatus({
      assetId: id,
      organizationId,
      actorName,
      actorEmail,
      actorRole,
      decision,
      note: body.note,
    });

    return NextResponse.json({
      success: true,
      asset: updated,
      message: `Visual asset "${updated.asset_name}" (v${updated.version}) marked as ${decision}.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Approval update failed.' },
      { status: err.status || 403 }
    );
  }
}
