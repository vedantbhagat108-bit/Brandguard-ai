import { NextRequest, NextResponse } from 'next/server';
import {
  visualAssetsRag,
  checkVisualRateLimit,
  generateBrandPngBuffer,
  type VisualAssetCategory,
  type VisualAssetApprovalStatus,
} from '@/backend/visualAssetsRag.ts';
import { checkUserDatabaseAccess } from '@/backend/accessControl.ts';
import type { UserRole } from '@/backend/types.ts';

export const runtime = 'nodejs';

const DEFAULT_ORG_ID = 'b0000001-0000-4000-8000-000000000001';

function extractCallerContext(req: NextRequest, body?: Record<string, any>) {
  const organizationId =
    req.headers.get('x-organization-id') ||
    req.headers.get('x-brand-id') ||
    body?.organization_id ||
    body?.brand_id ||
    new URL(req.url).searchParams.get('organization_id') ||
    new URL(req.url).searchParams.get('brand_id') ||
    DEFAULT_ORG_ID;

  const userId =
    req.headers.get('x-user-id') ||
    body?.user_id ||
    'u0000000-admin-vedant';

  const userName =
    req.headers.get('x-user-name') ||
    body?.uploaded_by ||
    body?.user_name ||
    'Vedant Bhagat';

  const userEmail =
    req.headers.get('x-user-email') ||
    body?.uploaded_by_email ||
    body?.user_email ||
    'VedantBhagat@admin.in';

  const callerRole =
    req.headers.get('x-security-role') ||
    req.headers.get('x-user-role') ||
    body?.role ||
    'manager';

  const normalizedAppRole: UserRole =
    callerRole === 'ADMIN' || callerRole === 'manager' || callerRole === 'admin'
      ? 'manager'
      : callerRole === 'REVIEWER' || callerRole === 'authorised_reviewer'
      ? 'authorised_reviewer'
      : 'content_creator';

  return {
    organizationId: String(organizationId).trim(),
    userId: String(userId).trim(),
    userName: String(userName).trim(),
    userEmail: String(userEmail).trim(),
    callerRole: String(callerRole).trim(),
    normalizedAppRole,
  };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = extractCallerContext(req);
    const access = checkUserDatabaseAccess(ctx.userId, ctx.normalizedAppRole);
    if (!access.allowed) {
      return NextResponse.json(
        {
          error: access.message || 'Organization database access not granted.',
          access_required: true,
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const category = (searchParams.get('category') || 'all') as VisualAssetCategory | 'all';
    const status = (searchParams.get('status') || 'all') as VisualAssetApprovalStatus | 'all';
    const query = searchParams.get('q') || searchParams.get('query') || '';
    const tag = searchParams.get('tag') || '';
    const campaignId = searchParams.get('campaign_id') || '';

    const assets = visualAssetsRag.listAssets({
      organizationId: ctx.organizationId,
      category,
      status,
      query,
      tag,
      campaignId,
    });

    return NextResponse.json({
      organization_id: ctx.organizationId,
      total: assets.length,
      assets,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to list visual assets.' },
      { status: err.status || 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = (req.headers.get('content-type') || '').toLowerCase();
    let buffer: Buffer;
    let fields: Record<string, any> = {};

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const fileEntry = formData.get('file');
      if (!(fileEntry instanceof File)) {
        return NextResponse.json(
          { error: 'A valid image file ("file" field) is required.' },
          { status: 400 }
        );
      }
      buffer = Buffer.from(await fileEntry.arrayBuffer());
      formData.forEach((value, key) => {
        if (key !== 'file') {
          fields[key] = typeof value === 'string' ? value : value.name;
        }
      });
    } else {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== 'object') {
        return NextResponse.json(
          { error: 'Request body must be multipart/form-data or a valid JSON object.' },
          { status: 400 }
        );
      }
      fields = body;
      if (body.image_base64 && typeof body.image_base64 === 'string') {
        const cleanedBase64 = body.image_base64.replace(/^data:[^;]+;base64,/, '');
        buffer = Buffer.from(cleanedBase64, 'base64');
      } else if (body.generate_swatch_colors && Array.isArray(body.generate_swatch_colors)) {
        const bg = body.generate_swatch_colors[0] || '#19AD73';
        const ac = body.generate_swatch_colors[1] || '#0C0F20';
        buffer = generateBrandPngBuffer(
          Number(body.width) || 320,
          Number(body.height) || 180,
          bg,
          ac
        );
      } else {
        return NextResponse.json(
          { error: 'Provide either a multipart "file" or "image_base64" payload.' },
          { status: 400 }
        );
      }
    }

    const ctx = extractCallerContext(req, fields);

    if (!checkVisualRateLimit(`upload:${ctx.userId}`, 25, 60_000)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for visual asset uploads. Please wait a moment.' },
        { status: 429 }
      );
    }

    const access = checkUserDatabaseAccess(ctx.userId, ctx.normalizedAppRole);
    if (!access.allowed) {
      return NextResponse.json(
        {
          error: access.message || 'Organization upload permission denied.',
          access_required: true,
        },
        { status: 403 }
      );
    }

    const rawTags = fields.tags;
    const parsedTags: string[] = Array.isArray(rawTags)
      ? rawTags.map(String)
      : typeof rawTags === 'string'
      ? rawTags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const rawColors = fields.dominant_colors;
    const parsedColors: string[] | undefined = Array.isArray(rawColors)
      ? rawColors.map(String)
      : typeof rawColors === 'string' && rawColors.trim()
      ? rawColors
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    const category = (fields.asset_category || fields.category || 'other') as VisualAssetCategory;

    const result = await visualAssetsRag.ingestVisualAsset({
      organizationId: ctx.organizationId,
      brandName: fields.brand_name,
      buffer,
      assetName: fields.asset_name || fields.name || 'Untitled Brand Asset',
      assetDescription: fields.asset_description || fields.description || '',
      assetCategory: category,
      tags: parsedTags,
      campaignId: fields.campaign_id,
      effectiveFrom: fields.effective_from,
      expiresAt: fields.expires_at || null,
      uploadedBy: ctx.userName,
      uploadedByEmail: ctx.userEmail,
      callerRole: ctx.callerRole,
      autoApprove: fields.auto_approve === true || fields.auto_approve === 'true',
      ocrTextHint: fields.ocr_text,
      dominantColorsHint: parsedColors,
      supersedesAssetId: fields.supersedes_asset_id || null,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Visual asset ingestion failed.' },
      { status: err.status || 400 }
    );
  }
}
