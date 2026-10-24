import { NextRequest, NextResponse } from 'next/server';
import { backendReviewStore } from '@/backend/reviewStore.ts';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const review = backendReviewStore.get(id);
  if (!review) {
    return NextResponse.json({ error: `Review ${id} not found.` }, { status: 404 });
  }
  return NextResponse.json(review);
}
