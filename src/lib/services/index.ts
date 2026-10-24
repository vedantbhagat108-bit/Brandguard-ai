import { BackendReviewService } from "@/lib/services/backend-review-service";
import type { ReviewService } from "@/lib/types";

// Active Live ReviewService integrated with the Two-RAG Backend Engine
export const reviewService: ReviewService = new BackendReviewService();

export const serviceMode = reviewService.mode;
export const usingMockService = serviceMode === "mock";

export { reviewService as default };
