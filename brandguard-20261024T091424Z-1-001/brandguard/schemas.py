from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

# Core Enums
DocType = Literal["style_rule", "approved_fact"]
ClaimType = Literal["factual", "tonal", "terminology"]
Severity = Literal["low", "medium", "high", "critical"]
ConfidentialityLevel = Literal["public", "internal", "confidential", "restricted"]
UserRole = Literal["content_creator", "manager", "authorised_reviewer", "admin", "auditor"]
WorkflowStatus = Literal[
    "draft", "pending_manager", "pending_reviewer", "approved", "rejected", "escalated"
]


# ---------- LLM Structured Output Contracts ----------
class LLMExtractedClaim(BaseModel):
    text: str = Field(description="Normalized single standalone claim sentence or phrase")
    excerpt: str = Field(description="Exact verbatim excerpt from the source text containing this claim")
    claim_type: ClaimType = Field(description="Classified type: factual (asserts fact/metric/SLA/partners), tonal (voice/posture/emotion), terminology (names/jargon/banned terms)")
    sensitivity_level: Literal["normal", "high_risk", "legal_sensitive"] = Field(default="normal")


class LLMExtractedClaims(BaseModel):
    claims: list[LLMExtractedClaim] = []


class LLMCitation(BaseModel):
    chunk_id: str
    quote: str = Field(min_length=3, description="Verbatim quote from the cited chunk")


class LLMFinding(BaseModel):
    issue: str
    excerpt: str = Field(min_length=3)
    rule_violated: str
    category: Literal["tone", "terminology", "contradiction", "unsupported_claim"] = "tone"
    severity: Severity
    confidence: float = Field(ge=0, le=1)
    citations: list[LLMCitation] = []
    suggested_fix: Optional[str] = None


class LLMFindings(BaseModel):
    findings: list[LLMFinding] = []


class LLMCorrection(BaseModel):
    corrected_text: str = Field(min_length=1)
    explanation: str
    citations: list[LLMCitation] = []


# ---------- Verified API Domain Models ----------
class Claim(BaseModel):
    claim_id: str
    text: str
    excerpt: str
    claim_type: ClaimType
    sensitivity_level: Literal["normal", "high_risk", "legal_sensitive"] = "normal"


class Citation(BaseModel):
    chunk_id: str
    document: str
    section: str = ""
    page: Optional[int] = None
    doc_type: DocType
    quote: str
    similarity: float = 1.0


class Finding(BaseModel):
    issue: str
    excerpt: str
    rule_violated: str
    category: Literal["tone", "terminology", "contradiction", "unsupported_claim", "knowledge_gap"] = "tone"
    severity: Severity
    confidence: float = Field(ge=0, le=1)
    citations: list[Citation] = []
    suggested_fix: Optional[str] = None
    is_knowledge_gap: bool = False


class UnsupportedClaim(BaseModel):
    claim_id: str
    claim_text: str
    excerpt: str
    reason: str
    highest_similarity: float
    best_candidate_document: Optional[str] = None
    action_required: str


class KnowledgeGap(BaseModel):
    topic: str
    claim_excerpt: str
    recommended_action: str
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class SuggestedEdit(BaseModel):
    original_excerpt: str
    suggested_text: str
    reason: str
    rule_violated: str
    citations: list[Citation] = []


class ChangeHistoryEntry(BaseModel):
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    action: str
    actor: str
    actor_role: UserRole
    notes: Optional[str] = None


class ReviewPackageSummary(BaseModel):
    total_claims: int
    claims_by_type: dict[str, int]
    findings_by_severity: dict[str, int]
    unsupported_claims_count: int
    knowledge_gaps_count: int
    compliance_score: float = Field(ge=0, le=100)
    publication_recommendation: Literal["APPROVED", "NEEDS_REVISION", "BLOCKED_CRITICAL"]


class ReviewPackage(BaseModel):
    package_id: str
    title: str = "Brand Governance Review Package"
    content_raw: str
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    creator_id: str = "creator-default"
    workflow_status: WorkflowStatus = "pending_manager"
    summary: ReviewPackageSummary
    claims: list[Claim]
    findings: list[Finding]
    unsupported_claims: list[UnsupportedClaim]
    knowledge_gaps: list[KnowledgeGap]
    source_links: list[Citation]
    suggested_edits: list[SuggestedEdit]
    change_history: list[ChangeHistoryEntry]


# ---------- Request & Response Models ----------
class IngestRequest(BaseModel):
    document_name: str
    content: str
    doc_type: DocType
    department: str = "marketing"
    confidentiality: ConfidentialityLevel = "internal"
    version: str = "1.0"
    metadata: dict[str, Any] = {}


class IngestResponse(BaseModel):
    document: str
    doc_type: DocType
    chunks: int
    version: str
    document_id: str


class AnalyzeRequest(BaseModel):
    content: str = Field(min_length=10)
    title: Optional[str] = "Untitled Marketing Copy"
    top_k: Optional[int] = Field(default=None, ge=1, le=15)
    creator_id: Optional[str] = "creator-1"
    department: Optional[str] = "marketing"
    caller_role: UserRole = "content_creator"
    confidentiality_clearance: ConfidentialityLevel = "internal"


class AnalyzeResponse(BaseModel):
    findings: list[Finding]
    unsupported_claims: list[UnsupportedClaim]
    claims_checked: int
    claims_by_type: dict[str, int]
    findings_rejected: int
    warnings: list[str] = []
    knowledge_gaps: list[KnowledgeGap] = []


class CorrectRequest(BaseModel):
    content: str = Field(min_length=3, description="Full text or offending sentence")
    finding: Finding
    recheck: bool = True
    actor_id: str = "creator-1"


class CorrectResponse(BaseModel):
    original: str
    corrected: str
    explanation: str
    citations: list[Citation]
    verified_clean: Optional[bool] = None


class ReviewPackageRequest(BaseModel):
    content: str = Field(min_length=10)
    title: Optional[str] = "Marketing Campaign Review"
    creator_id: str = "creator-1"
    department: str = "marketing"
    caller_role: UserRole = "content_creator"
    confidentiality_clearance: ConfidentialityLevel = "internal"


class WorkflowActionRequest(BaseModel):
    package_id: str
    action: Literal["approve", "reject", "escalate", "comment", "apply_edits"]
    actor_id: str
    actor_role: UserRole
    notes: Optional[str] = None
    edited_content: Optional[str] = None


class WorkflowActionResponse(BaseModel):
    package_id: str
    status: WorkflowStatus
    message: str
    updated_at: str
    change_history: list[ChangeHistoryEntry]


class DocumentItem(BaseModel):
    document: str
    doc_type: DocType
    chunks: int
    version: str
    department: str
    confidentiality: ConfidentialityLevel
    updated_at: str
