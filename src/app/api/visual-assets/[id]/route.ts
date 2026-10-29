import { NextRequest, NextResponse } from 'next/server';
import {
  visualAssetsRag,
  generateBrandPngBuffer,
  type VisualAssetCategory,
} from '@/backend/visualAssetsRag.ts';

export const runtime = 'nodejs';

const DEFAULT_ORG_ID = 'b0000001-0000-4000-8000-000000000001';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const organizationId =
    req.headers.get('x-organization-id') ||
    req.headers.get('x-brand-id') ||
    new URL(req.url).searchParams.get('organization_id') ||
    new URL(req.url).searchParams.get('brand_id') ||
    DEFAULT_ORG_ID;

  const asset = visualAssetsRag.getAssetForOrg(id, organizationId);
  if (!asset) {
    return NextResponse.json(
      { error: `Visual asset "${id}" not found or unauthorized for organization.` },
      { status: 404 }
    );
  }

  return NextResponse.json(asset);
}

/**
 * Replace an asset with a new version without overwriting historical review evidence.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const organizationId =
      req.headers.get('x-organization-id') ||
      req.headers.get('x-brand-id') ||
      body.organization_id ||
      body.brand_id ||
      DEFAULT_ORG_ID;

    const existing = visualAssetsRag.getAssetForOrg(id, organizationId);
    if (!existing) {
      return NextResponse.json(
        { error: `Visual asset "${id}" not found in your organization.` },
        { status: 404 }
      );
    }

    let buffer: Buffer;
    if (body.image_base64 && typeof body.image_base64 === 'string') {
      const cleaned = body.image_base64.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(cleaned, 'base64');
    } else if (body.generate_swatch_colors && Array.isArray(body.generate_swatch_colors)) {
      buffer = generateBrandPngBuffer(
        existing.width,
        existing.height,
        body.generate_swatch_colors[0] || '#19AD73',
        body.generate_swatch_colors[1] || '#0C0F20'
      );
    } else {
      return NextResponse.json(
        { error: 'Provide image_base64 or generate_swatch_colors for the new asset version.' },
        { status: 400 }
      );
    }

    const callerRole =
      req.headers.get('x-security-role') ||
      req.headers.get('x-user-role') ||
      body.role ||
      'manager';

    const result = await visualAssetsRag.ingestVisualAsset({
      organizationId,
      brandName: existing.brand_name,
      buffer,
      assetName: body.asset_name || existing.asset_name,
      assetDescription: body.asset_description || existing.asset_description,
      assetCategory: (body.asset_category || existing.asset_category) as VisualAssetCategory,
      tags: Array.isArray(body.tags) ? body.tags : existing.tags,
      campaignId: body.campaign_id ?? existing.campaign_id ?? undefined,
      uploadedBy: body.uploaded_by || req.headers.get('x-user-name') || 'Vedant Bhagat',
      uploadedByEmail:
        body.uploaded_by_email || req.headers.get('x-user-email') || 'VedantBhagat@admin.in',
      callerRole,
      autoApprove: Boolean(body.auto_approve),
      ocrTextHint: body.ocr_text,
      supersedesAssetId: existing.id,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to create new asset version.' },
      { status: err.status || 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const organizationId =
      req.headers.get('x-organization-id') ||
      req.headers.get('x-brand-id') ||
      new URL(req.url).searchParams.get('organization_id') ||
      new URL(req.url).searchParams.get('brand_id') ||
      DEFAULT_ORG_ID;

    const actorRole =
      req.headers.get('x-security-role') ||
      req.headers.get('x-user-role') ||
      'CREATOR';
    const actorName = req.headers.get('x-user-name') || 'Vedant Bhagat';
    const actorEmail = req.headers.get('x-user-email') || 'VedantBhagat@admin.in';

    const res = visualAssetsRag.deleteAsset({
      assetId: id,
      organizationId,
      actorName,
      actorEmail,
      actorRole,
    });

    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to delete visual asset.' },
      { status: err.status || 403 }
    );
  }
}
