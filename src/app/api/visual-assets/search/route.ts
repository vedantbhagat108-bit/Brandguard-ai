import { NextRequest, NextResponse } from 'next/server';
import { visualAssetsRag, VisualAssetCategory } from '@/backend/visualAssetsRag.ts';

export const runtime = 'nodejs';

const DEFAULT_ORG_ID = 'b0000001-0000-4000-8000-000000000001';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const organizationId =
      req.headers.get('x-organization-id') ||
      req.headers.get('x-brand-id') ||
      body.organization_id ||
      body.brand_id ||
      DEFAULT_ORG_ID;

    const queryText = typeof body.query_text === 'string' ? body.query_text : body.query || '';
    const category = (body.category || 'all') as VisualAssetCategory | 'all';
    const tags = Array.isArray(body.tags)
      ? body.tags
      : typeof body.tags === 'string'
      ? body.tags
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean)
      : undefined;
    const dominantColors = Array.isArray(body.dominant_colors)
      ? body.dominant_colors
      : typeof body.color_hex === 'string' && body.color_hex.trim()
      ? [body.color_hex.trim()]
      : undefined;
    const campaignId = typeof body.campaign_id === 'string' ? body.campaign_id : undefined;
    const topK = Number(body.top_k || 6);

    const results = await visualAssetsRag.searchAuthoritativeVisualAssets({
      organizationId,
      queryText,
      category,
      tags,
      dominantColors,
      campaignId,
      topK,
      includeHistoricalForAudit: Boolean(body.include_historical),
    });

    return NextResponse.json({
      success: true,
      organization_id: organizationId,
      count: results.length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Visual asset search failed.' },
      { status: err.status || 400 }
    );
  }
}
