import { NextResponse } from 'next/server';
import { backendReviewStore } from '@/backend/reviewStore.ts';

export const runtime = 'nodejs';

export async function POST() {
  const reviews = backendReviewStore.reset();
  return NextResponse.json(reviews);
}
