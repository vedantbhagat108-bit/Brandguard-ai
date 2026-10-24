export type DocType = 'style_rule' | 'approved_fact';
export type ClaimType = 'factual' | 'tonal' | 'terminology';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type ConfidentialityLevel = 'public' | 'internal' | 'confidential' | 'restricted';
export type UserRole = 'content_creator' | 'manager' | 'authorised_reviewer' | 'admin' | 'auditor';
export type WorkflowStatus = 'draft' | 'pending_manager' | 'pending_reviewer' | 'approved' | 'rejected' | 'escalated';

export interface Claim {
  claim_id: string;
  text: string;
  excerpt: string;
  claim_type: ClaimType;
  sensitivity_level: 'normal' | 'high_risk' | 'legal_sensitive';
  context?: string;
}

export interface Citation {
  chunk_id: string;
  document: string;
  section: string;
  page?: number;
  doc_type: DocType;
  quote: string;
  similarity: number;
}

export interface Finding {
  issue: string;
  excerpt: string;
  rule_violated: string;
  category: 'tone' | 'terminology' | 'contradiction' | 'unsupported_claim' | 'knowledge_gap';
  severity: Severity;
  confidence: number;
  citations: Citation[];
  suggested_fix?: string | null;
  is_knowledge_gap?: boolean;
}

export interface UnsupportedClaim {
  claim_id: string;
  claim_text: string;
  excerpt: string;
  reason: string;
  highest_similarity: number;
  best_candidate_document?: string;
  action_required: string;
}

export interface KnowledgeGap {
  topic: string;
  claim_excerpt: string;
  recommended_action: string;
  created_at: string;
}

export interface SuggestedEdit {
  original_excerpt: string;
  suggested_text: string;
  reason: string;
  rule_violated: string;
  citations: Citation[];
}

export interface ChangeHistoryEntry {
  timestamp: string;
  action: string;
  actor: string;
  actor_role: UserRole;
  notes?: string;
}

export interface ReviewPackageSummary {
  total_claims: number;
  claims_by_type: Record<ClaimType, number>;
  findings_by_severity: Record<Severity, number>;
  unsupported_claims_count: number;
  knowledge_gaps_count: number;
  compliance_score: number;
  publication_recommendation: 'APPROVED' | 'NEEDS_REVISION' | 'BLOCKED_CRITICAL';
}

export interface ReviewPackage {
  package_id: string;
  title: string;
  content_raw: string;
  created_at: string;
  creator_id: string;
  workflow_status: WorkflowStatus;
  summary: ReviewPackageSummary;
  claims: Claim[];
  findings: Finding[];
  unsupported_claims: UnsupportedClaim[];
  knowledge_gaps: KnowledgeGap[];
  source_links: Citation[];
  suggested_edits: SuggestedEdit[];
  change_history: ChangeHistoryEntry[];
}

export interface StoredDocument {
  document: string;
  doc_type: DocType;
  chunks: number;
  version: string;
  department: string;
  confidentiality: ConfidentialityLevel;
  updated_at: string;
}
