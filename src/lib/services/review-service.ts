/**
 * Service contract for review persistence and workflow operations.
 *
 * The UI only imports the singleton from `@/lib/services`. To connect a live
 * backend, implement `ReviewService` in a new adapter and swap the factory in
 * `src/lib/services/index.ts`. No live endpoint or response schema was supplied
 * with this project, so the shipped adapter is deliberately local/mock-only.
 */
export type { ReviewService } from "@/lib/types";
