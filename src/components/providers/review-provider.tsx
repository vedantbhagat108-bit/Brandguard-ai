"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { reviewService } from "@/lib/services";
import type {
  FindingAction,
  Review,
  ReviewSubmission,
} from "@/lib/types";

interface ReviewContextValue {
  reviews: Review[];
  loading: boolean;
  error: string | null;
  getReview: (id: string) => Review | undefined;
  refresh: () => Promise<void>;
  createReview: (input: ReviewSubmission) => Promise<Review>;
  updateFinding: (
    reviewId: string,
    findingId: string,
    action: FindingAction,
    payload?: { replacement?: string; reason?: string },
  ) => Promise<Review>;
  addComment: (reviewId: string, body: string) => Promise<Review>;
  requestChanges: (reviewId: string, note: string) => Promise<Review>;
  approveReview: (reviewId: string, note: string) => Promise<Review>;
  rejectReview: (reviewId: string, reason: string) => Promise<Review>;
  simulateCreatorRevision: (reviewId: string) => Promise<Review>;
  resetDemo: () => Promise<void>;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

function sortReviews(reviews: Review[]) {
  return [...reviews].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await reviewService.listReviews();
      setReviews(sortReviews(next));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The review queue could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    reviewService
      .listReviews()
      .then((next) => {
        if (cancelled) return;
        setReviews(sortReviews(next));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "The review queue could not load.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const replaceReview = useCallback((updated: Review) => {
    setReviews((current) =>
      sortReviews(
        current.map((review) =>
          review.id === updated.id ? updated : review,
        ),
      ),
    );
  }, []);

  const getReview = useCallback(
    (id: string) => reviews.find((review) => review.id === id),
    [reviews],
  );

  const createReview = useCallback(
    async (input: ReviewSubmission) => {
      const review = await reviewService.createReview(input);
      setReviews((current) => sortReviews([review, ...current]));
      return review;
    },
    [],
  );

  const updateFinding = useCallback(
    async (
      reviewId: string,
      findingId: string,
      action: FindingAction,
      payload?: { replacement?: string; reason?: string },
    ) => {
      const updated = await reviewService.updateFinding(
        reviewId,
        findingId,
        action,
        payload,
      );
      replaceReview(updated);
      return updated;
    },
    [replaceReview],
  );

  const addComment = useCallback(
    async (reviewId: string, body: string) => {
      const updated = await reviewService.addComment(reviewId, body);
      replaceReview(updated);
      return updated;
    },
    [replaceReview],
  );

  const requestChanges = useCallback(
    async (reviewId: string, note: string) => {
      const updated = await reviewService.requestChanges(reviewId, note);
      replaceReview(updated);
      return updated;
    },
    [replaceReview],
  );

  const approveReview = useCallback(
    async (reviewId: string, note: string) => {
      const updated = await reviewService.approveReview(reviewId, note);
      replaceReview(updated);
      return updated;
    },
    [replaceReview],
  );

  const rejectReview = useCallback(
    async (reviewId: string, reason: string) => {
      const updated = await reviewService.rejectReview(reviewId, reason);
      replaceReview(updated);
      return updated;
    },
    [replaceReview],
  );

  const simulateCreatorRevision = useCallback(
    async (reviewId: string) => {
      const updated = await reviewService.simulateCreatorRevision(reviewId);
      replaceReview(updated);
      return updated;
    },
    [replaceReview],
  );

  const resetDemo = useCallback(async () => {
    const next = await reviewService.resetDemo();
    setReviews(sortReviews(next));
  }, []);

  const value = useMemo<ReviewContextValue>(
    () => ({
      reviews,
      loading,
      error,
      getReview,
      refresh,
      createReview,
      updateFinding,
      addComment,
      requestChanges,
      approveReview,
      rejectReview,
      simulateCreatorRevision,
      resetDemo,
    }),
    [
      reviews,
      loading,
      error,
      getReview,
      refresh,
      createReview,
      updateFinding,
      addComment,
      requestChanges,
      approveReview,
      rejectReview,
      simulateCreatorRevision,
      resetDemo,
    ],
  );

  return (
    <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>
  );
}

export function useReviews() {
  const context = useContext(ReviewContext);
  if (!context) {
    throw new Error("useReviews must be used inside ReviewProvider.");
  }
  return context;
}
