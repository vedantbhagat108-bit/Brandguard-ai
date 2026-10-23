import { MockReviewService } from "@/lib/services/mock-review-service";
import type { ReviewService } from "@/lib/types";

export const reviewService: ReviewService = new MockReviewService();

/**
 * The app currently ships with a deterministic, localStorage-backed mock
 * service so the full walkthrough works without credentials or a backend.
 *
 * No live review API endpoint or response schema was provided, so no HTTP
 * adapter is assumed. To integrate one, implement `ReviewService` (see
 * `src/lib/types.ts`) and return it from this factory.
 */
export const serviceMode = reviewService.mode;
export const usingMockService = serviceMode === "mock";

export { reviewService as default };
