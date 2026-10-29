import { NextRequest, NextResponse } from 'next/server';
import {
  visualAssetsRag,
  verifySignedPreviewToken,
} from '@/backend/visualAssetsRag.ts';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { searchParams } = new URL(req.url);
  const org = searchParams.get('org') || '';
  const exp = searchParams.get('exp') || '';
  const sig = searchParams.get('sig') || '';

  if (!org || !exp || !sig) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing signed preview URL parameters (org, exp, sig).' },
      { status: 401 }
    );
  }

  const verification = verifySignedPreviewToken({
    assetId: id,
    organizationId: org,
    exp,
    sig,
  });

  if (!verification.valid) {
    return NextResponse.json(
      { error: `Unauthorized preview access: ${verification.reason}` },
      { status: 403 }
    );
  }

  const blob = visualAssetsRag.getPrivateBlobForOrg(id, org);
  if (!blob) {
    return NextResponse.json(
      { error: 'Visual asset binary not found for the authorized organization.' },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(blob.buffer), {
    status: 200,
    headers: {
      'Content-Type': blob.mimeType,
      'Content-Length': String(blob.buffer.length),
      'Cache-Control': 'private, max-age=60, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
