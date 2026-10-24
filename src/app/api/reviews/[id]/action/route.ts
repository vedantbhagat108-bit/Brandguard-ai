import { NextRequest, NextResponse } from 'next/server';
import { backendReviewStore } from '@/backend/reviewStore.ts';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
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

    const { action_type } = body;

    if (action_type === 'update_finding') {
      const { finding_id, action, replacement, reason } = body;
      if (!finding_id || !action) {
        return NextResponse.json(
          { error: 'finding_id and action are required.' },
          { status: 400 }
        );
      }
      const updated = backendReviewStore.updateFinding(id, finding_id, action, {
        replacement,
        reason,
      });
      return NextResponse.json(updated);
    }

    if (action_type === 'add_comment') {
      const { body: commentBody, author, role } = body;
      const updated = backendReviewStore.addComment(id, commentBody || '', author, role);
      return NextResponse.json(updated);
    }

    if (action_type === 'decision') {
      const { decision, note, by } = body;
      if (!['approved', 'rejected', 'changes_requested'].includes(decision)) {
        return NextResponse.json(
          { error: 'decision must be approved, rejected, or changes_requested.' },
          { status: 400 }
        );
      }
      const updated = backendReviewStore.applyDecision(id, decision, note || '', by);
      return NextResponse.json(updated);
    }

    if (action_type === 'simulate_revision') {
      const updated = backendReviewStore.simulateCreatorRevision(id);
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: `Unknown action_type "${action_type}"` }, { status: 400 });
  } catch (err: any) {
    const msg = err?.message || 'Action failed';
    const status =
      typeof err?.status === 'number'
        ? err.status
        : /not found/i.test(msg)
        ? 404
        : /already decided|already been reviewed|critical finding|Explain|Add a|under|identical|no suggested fixes|cannot be empty/i.test(msg)
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
