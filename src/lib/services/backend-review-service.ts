import type {
  FindingAction,
  Review,
  ReviewService,
  ReviewSubmission,
} from '@/lib/types';

/**
 * Live Backend Review Service:
 * Completely replaces mock local data handling with real backend API calls.
 * All review creation, claim analysis, findings, and decisions are stored
 * and managed by the backend API service module.
 */
export class BackendReviewService implements ReviewService {
  readonly mode = 'live' as const;

  async listReviews(): Promise<Review[]> {
    const res = await fetch('/api/reviews');
    if (!res.ok) {
      throw new Error('Failed to load review data from backend API.');
    }
    return res.json();
  }

  async getReview(id: string): Promise<Review | null> {
    const res = await fetch(`/api/reviews/${encodeURIComponent(id)}`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Failed to fetch review ${id} from backend API.`);
    }
    return res.json();
  }

  async createReview(input: ReviewSubmission): Promise<Review> {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Backend review generation failed.' }));
      throw new Error(err.error || 'Backend review generation failed.');
    }

    return res.json();
  }

  async updateFinding(
    reviewId: string,
    findingId: string,
    action: FindingAction,
    payload?: { replacement?: string; reason?: string }
  ): Promise<Review> {
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: 'update_finding',
        finding_id: findingId,
        action,
        replacement: payload?.replacement,
        reason: payload?.reason,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update finding.' }));
      throw new Error(err.error || 'Failed to update finding.');
    }

    return res.json();
  }

  async addComment(reviewId: string, body: string): Promise<Review> {
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: 'add_comment',
        body,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add comment.' }));
      throw new Error(err.error || 'Failed to add comment.');
    }

    return res.json();
  }

  async requestChanges(reviewId: string, note: string): Promise<Review> {
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: 'decision',
        decision: 'changes_requested',
        note,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to request changes.' }));
      throw new Error(err.error || 'Failed to request changes.');
    }

    return res.json();
  }

  async approveReview(reviewId: string, note: string): Promise<Review> {
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: 'decision',
        decision: 'approved',
        note,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to approve review.' }));
      throw new Error(err.error || 'Failed to approve review.');
    }

    return res.json();
  }

  async rejectReview(reviewId: string, reason: string): Promise<Review> {
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: 'decision',
        decision: 'rejected',
        note: reason,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to reject review.' }));
      throw new Error(err.error || 'Failed to reject review.');
    }

    return res.json();
  }

  async simulateCreatorRevision(reviewId: string): Promise<Review> {
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: 'simulate_revision',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to simulate revision.' }));
      throw new Error(err.error || 'Failed to simulate revision.');
    }

    return res.json();
  }

  async resetDemo(): Promise<Review[]> {
    const res = await fetch('/api/reviews/reset', { method: 'POST' });
    if (!res.ok) {
      throw new Error('Failed to reset review data.');
    }
    return res.json();
  }
}
