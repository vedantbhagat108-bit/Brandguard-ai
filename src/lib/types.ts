export const CHANNELS = [
  "Instagram",
  "LinkedIn",
  "Email",
  "Product page",
  "Paid social",
  "Blog",
  "Creator brief",
] as const;

export type Channel = (typeof CHANNELS)[number];

export type Severity = "critical" | "high" | "medium" | "low";
export type ReviewStatus =
  | "in_review"
  | "changes_requested"
  | "approved"
  | "rejected";
export type FindingStatus = "open" | "accepted" | "edited" | "dismissed";
export type FindingAction = "accept" | "edit" | "dismiss";
export type FindingCategory =
  | "Claims"
  | "Disclosure"
  | "Terminology"
  | "Tone"
  | "Regulatory"
  | "Accessibility";

export type KnowledgeSourceType = "Policy" | "Playbook" | "Fact sheet" | "Guide";

export interface WorkspaceProfile {
  name: string;
  legalName: string;
  site: string;
  tagline: string;
  knowledgeVersion: string;
  knowledgeUpdatedAt: string;
  region: string;
}

export interface KnowledgeSource {
  id: string;
  title: string;
  type: KnowledgeSourceType;
  version: string;
  owner: string;
  approvedBy: string;
  approvedAt: string;
  sections: number;
  description: string;
  status: "approved";
}

export interface PolicyRule {
  id: string;
  code: string;
  title: string;
  category: FindingCategory;
  defaultSeverity: Severity;
  description: string;
  requirement: string;
  approvedExample: string;
  sourceId: string;
}

export interface ApprovedFact {
  id: string;
  product: string;
  claim: string;
  studyId: string;
  sourceId: string;
  approvedOn: string;
}

export interface FindingSource {
  sourceId: string;
  title: string;
  section: string;
  quote: string;
  version: string;
  approvedBy: string;
  updatedAt: string;
}

export interface FindingResolution {
  action: Exclude<FindingStatus, "open">;
  by: string;
  at: string;
  note?: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  ruleCode: string;
  title: string;
  category: FindingCategory;
  severity: Severity;
  status: FindingStatus;
  evidence: string;
  start: number;
  end: number;
  explanation: string;
  suggestedFix: string;
  confidence: number;
  source: FindingSource;
  resolution?: FindingResolution;
}

export interface KnowledgeGap {
  id: string;
  topic: string;
  evidence: string;
  start: number;
  end: number;
  explanation: string;
  recommendation: string;
  confidence: number;
}

export interface ReviewVersion {
  id: string;
  number: number;
  content: string;
  createdAt: string;
  author: string;
  note: string;
  source: "submission" | "edit" | "creator_revision" | "restore";
  openFindings: number;
}

export type CommentType = "comment" | "decision" | "system";

export interface ReviewComment {
  id: string;
  author: string;
  role: string;
  body: string;
  createdAt: string;
  type: CommentType;
}

export interface ReviewDecision {
  action: "approved" | "rejected";
  by: string;
  at: string;
  note: string;
}

export type ActivityType =
  | "submitted"
  | "finding"
  | "comment"
  | "version"
  | "decision"
  | "analysis";

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  message: string;
  actor: string;
  at: string;
}

export interface Review {
  id: string;
  title: string;
  channel: Channel;
  status: ReviewStatus;
  content: string;
  submittedBy: string;
  submittedRole: string;
  submittedAt: string;
  updatedAt: string;
  assignedTo: string;
  dueAt?: string;
  isPaidPartnership: boolean;
  score: number;
  summary: string;
  findings: Finding[];
  knowledgeGaps: KnowledgeGap[];
  versions: ReviewVersion[];
  comments: ReviewComment[];
  activity: ActivityEvent[];
  decision?: ReviewDecision;
  sourceFileName?: string;
}

export interface ReviewSubmission {
  title: string;
  channel: Channel;
  content: string;
  isPaidPartnership: boolean;
  submittedBy?: string;
  sourceFileName?: string;
  brandKnowledgeText?: string;
  brandKnowledgeFileName?: string;
}

export interface DemoUser {
  name: string;
  role: string;
  initials: string;
}

export interface AnalysisResult {
  findings: Finding[];
  knowledgeGaps: KnowledgeGap[];
  summary: string;
  score: number;
}

export interface ReviewService {
  readonly mode: "mock" | "live";
  listReviews(): Promise<Review[]>;
  getReview(id: string): Promise<Review | null>;
  createReview(input: ReviewSubmission): Promise<Review>;
  updateFinding(
    reviewId: string,
    findingId: string,
    action: FindingAction,
    payload?: { replacement?: string; reason?: string },
  ): Promise<Review>;
  addComment(reviewId: string, body: string): Promise<Review>;
  requestChanges(reviewId: string, note: string): Promise<Review>;
  approveReview(reviewId: string, note: string): Promise<Review>;
  rejectReview(reviewId: string, reason: string): Promise<Review>;
  simulateCreatorRevision(reviewId: string): Promise<Review>;
  resetDemo(): Promise<Review[]>;
}
