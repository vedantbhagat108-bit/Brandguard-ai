import { NextRequest, NextResponse } from 'next/server';
import {
  visualAssetsRag,
  generateBrandPngBuffer,
} from '@/backend/visualAssetsRag.ts';

export const runtime = 'nodejs';

const DEFAULT_ORG_ID = 'b0000001-0000-4000-8000-000000000001';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const organizationId =
    req.headers.get('x-organization-id') ||
    req.headers.get('x-brand-id') ||
    searchParams.get('organization_id') ||
    DEFAULT_ORG_ID;

  const reviews = Array.from(visualAssetsRag.visualReviews.values())
    .filter((r) => r.organization_id === organizationId)
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    .slice(0, 20);

  return NextResponse.json({
    success: true,
    organization_id: organizationId,
    count: reviews.length,
    reviews,
  });
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    let organizationId =
      req.headers.get('x-organization-id') ||
      req.headers.get('x-brand-id') ||
      DEFAULT_ORG_ID;
    let submittedBy = req.headers.get('x-user-name') || 'Vedant Bhagat';
    let submittedByEmail = req.headers.get('x-user-email') || 'VedantBhagat@admin.in';
    let callerRole =
      req.headers.get('x-security-role') ||
      req.headers.get('x-user-role') ||
      'ADMIN';

    let buffer: Buffer | null = null;
    let title = 'Creative Visual Submission';
    let fileName = 'creative-submission.png';
    let campaignId: string | undefined;
    let altText: string | undefined;
    let requireLogo = true;
    let ocrTextHint: string | undefined;
    let dominantColorsHint: string[] | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json(
          { error: 'Missing image file in multipart form data.' },
          { status: 400 }
        );
      }
      const arrayBuf = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuf);
      fileName = file.name || 'uploaded-creative.png';
      title = String(formData.get('title') || fileName.replace(/\.[^.]+$/, ''));
      campaignId = formData.get('campaign_id') ? String(formData.get('campaign_id')) : undefined;
      altText = formData.get('alt_text') ? String(formData.get('alt_text')) : undefined;
      if (formData.get('require_logo') !== null) {
        requireLogo = String(formData.get('require_logo')) !== 'false';
      }
      ocrTextHint = formData.get('ocr_text_hint') ? String(formData.get('ocr_text_hint')) : undefined;
      if (formData.get('organization_id')) {
        organizationId = String(formData.get('organization_id'));
      }
    } else {
      const body = await req.json();
      if (body.organization_id || body.brand_id) {
        organizationId = String(body.organization_id || body.brand_id);
      }
      if (body.submitted_by) submittedBy = String(body.submitted_by);
      if (body.submitted_by_email) submittedByEmail = String(body.submitted_by_email);
      if (body.role) callerRole = String(body.role);

      title = String(body.title || 'Submitted Campaign Creative');
      fileName = String(body.file_name || 'submitted-creative.png');
      campaignId = body.campaign_id ? String(body.campaign_id) : undefined;
      altText = body.alt_text !== undefined ? String(body.alt_text) : undefined;
      if (body.require_logo !== undefined) {
        requireLogo = Boolean(body.require_logo);
      }
      ocrTextHint = body.ocr_text_hint ? String(body.ocr_text_hint) : undefined;
      dominantColorsHint = Array.isArray(body.dominant_colors_hint)
        ? body.dominant_colors_hint
        : undefined;

      if (body.image_base64) {
        const cleanB64 = String(body.image_base64).replace(/^data:[^;]+;base64,/, '');
        buffer = Buffer.from(cleanB64, 'base64');
      } else if (body.sample_preset) {
        const preset = String(body.sample_preset);
        if (preset === 'compliant_2026_banner') {
          buffer = generateBrandPngBuffer(360, 200, '#19AD73', '#0C0F20');
          title = body.title || 'EcoFresh Spring 2026 Herbal Drops Compliant Banner';
          fileName = 'ecofresh-spring-2026-compliant.png';
          altText =
            body.alt_text ??
            'EcoFresh Botanicals Spring 2026 Herbal Drops banner with primary leaf logo and FDA disclaimer';
          ocrTextHint =
            body.ocr_text_hint ||
            'ECOFRESH BOTANICALS HERBAL DROPS SUPPORTS MINDFUL DAILY WELLNESS. THESE STATEMENTS HAVE NOT BEEN EVALUATED BY THE FDA.';
          dominantColorsHint = ['#19AD73', '#0C0F20', '#EDFCF4'];
        } else if (preset === 'outdated_2025_campaign') {
          // Exact binary match with seeded superseded v1 asset (360x200, #3CC98D / #272C43)
          buffer = generateBrandPngBuffer(360, 200, '#3CC98D', '#272C43');
          title = body.title || 'EcoFresh Spring Herbal Drops Legacy 2025 Graphic';
          fileName = 'ecofresh-spring-2025-legacy.png';
          altText = body.alt_text ?? '';
          ocrTextHint =
            body.ocr_text_hint || 'ECOFRESH HERBAL DROPS NATURAL DAILY ENERGY';
          dominantColorsHint = ['#3CC98D', '#272C43'];
        } else if (preset === 'off_brand_prohibited_claim') {
          buffer = generateBrandPngBuffer(360, 200, '#FF1E56', '#FF4B5C');
          title = body.title || 'Unapproved Neon Promo Banner — Miracle Cure Ad';
          fileName = 'unapproved-neon-cure-ad.png';
          altText = body.alt_text ?? '';
          ocrTextHint =
            body.ocr_text_hint ||
            '100% CURE FOR METABOLISM & INSTANT WRINKLE ERASURE! UNBEATABLE #1 SUPPLEMENT!';
          dominantColorsHint = ['#FF1E56', '#FF4B5C'];
        } else {
          buffer = generateBrandPngBuffer(320, 180, '#19AD73', '#0C0F20');
        }
      } else if (body.generate_swatch_colors && Array.isArray(body.generate_swatch_colors)) {
        const bg = body.generate_swatch_colors[0] || '#19AD73';
        const acc = body.generate_swatch_colors[1] || '#0C0F20';
        buffer = generateBrandPngBuffer(
          Number(body.width || 320),
          Number(body.height || 180),
          bg,
          acc
        );
      }
    }

    if (!buffer) {
      return NextResponse.json(
        { error: 'Please provide an image file, base64 payload, or sample_preset.' },
        { status: 400 }
      );
    }

    const report = await visualAssetsRag.runVisualGovernanceReview({
      organizationId,
      submittedBy,
      submittedByEmail,
      callerRole,
      title,
      fileName,
      buffer,
      campaignId,
      altText,
      requireLogo,
      ocrTextHint,
      dominantColorsHint,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Visual governance review failed.' },
      { status: err.status || 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const organizationId =
      req.headers.get('x-organization-id') ||
      req.headers.get('x-brand-id') ||
      body.organization_id ||
      DEFAULT_ORG_ID;

    const reviewerName =
      req.headers.get('x-user-name') || body.reviewer_name || 'Vedant Bhagat';
    const reviewerRole =
      req.headers.get('x-security-role') ||
      req.headers.get('x-user-role') ||
      body.role ||
      'ADMIN';

    const updatedReport = visualAssetsRag.resolveVisualFinding({
      reviewId: String(body.review_id || ''),
      findingId: String(body.finding_id || ''),
      organizationId,
      reviewerName,
      reviewerRole,
      status: body.status || 'overridden',
      note: String(body.note || ''),
    });

    return NextResponse.json({
      success: true,
      report: updatedReport,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to resolve visual finding.' },
      { status: err.status || 400 }
    );
  }
}
