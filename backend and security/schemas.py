import uuid
from datetime import datetime, timezone
from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


# ---------------------------------------------------------
# Frontend Contract Enums (100% Parity with src/lib/types.ts)
# ---------------------------------------------------------

ChannelType = Literal[
    "Instagram", "LinkedIn", "Email", "Product page",
    "Paid social", "Blog", "Creator brief"
]

SeverityType = Literal["critical", "high", "medium", "low"]
ReviewStatusType = Literal["in_review", "changes_requested", "approved", "rejected"]
FindingStatusType = Literal["open", "accepted", "edited", "dismissed"]


# ---------------------------------------------------------
# Nested Models Matching TypeScript Interfaces Exactly
# ---------------------------------------------------------

class FindingSourceSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sourceId: str = Field(..., description="Unique policy document or rule reference ID")
    title: str = Field(..., description="Display title of the guideline or policy")
    section: str = Field(..., description="Specific policy section reference")
    quote: str = Field(..., description="Verbatim quote from the policy")
    version: str = Field("1.0", description="Policy version number")
    approvedBy: str = Field("Legal Compliance", description="Authority approving the policy")
    updatedAt: str = Field("2026-10-24T00:00:00Z", description="ISO 8601 timestamp of last policy update")


class FindingSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="Unique finding ID")
    ruleId: str = Field(..., description="Underlying rule ID")
    ruleCode: str = Field(..., description="Short alphanumeric rule code (e.g. CLAIM-01)")
    title: str = Field(..., description="Short finding title")
    category: Literal["Claims", "Disclosure", "Terminology", "Tone", "Regulatory", "Accessibility"]
    severity: SeverityType
    status: FindingStatusType = "open"
    evidence: str = Field(..., description="Exact flagged substring from content")
    start: int = Field(0, description="Start character offset in content")
    end: int = Field(0, description="End character offset in content")
    explanation: str = Field(..., description="Plain-language explanation of the violation")
    suggestedFix: str = Field(..., description="Context-preserving suggested replacement")
    confidence: float = Field(0.95, ge=0.0, le=1.0, description="Confidence score")
    source: FindingSourceSchema


class KnowledgeGapSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    topic: str
    evidence: str
    start: int = 0
    end: int = 0
    explanation: str
    recommendation: str
    confidence: float = 0.90


class ReviewVersionSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    number: int
    content: str
    createdAt: str
    author: str
    note: str
    source: Literal["submission", "edit", "creator_revision", "restore"] = "submission"
    openFindings: int = 0


class ReviewCommentSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    author: str
    role: str
    body: str
    createdAt: str
    type: Literal["comment", "decision", "system"] = "comment"


class ActivityEventSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    type: Literal["submitted", "finding", "comment", "version", "decision", "analysis"]
    message: str
    actor: str
    at: str


# ---------------------------------------------------------
# Request & Response Contracts for /api/reviews
# ---------------------------------------------------------

class ReviewSubmissionCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(..., min_length=2, description="Campaign or post title")
    channel: ChannelType = Field(..., description="Target distribution channel")
    content: str = Field(..., min_length=5, description="Draft copy content")
    isPaidPartnership: bool = Field(False, description="Flag indicating sponsored/paid partnership")
    submittedBy: Optional[str] = Field("Creator", description="Author or creator name")
    sourceFileName: Optional[str] = Field(None, description="Optional uploaded source file name")


class ReviewResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    channel: ChannelType
    status: ReviewStatusType = "in_review"
    content: str
    submittedBy: str
    submittedRole: str = "CREATOR"
    submittedAt: str
    updatedAt: str
    assignedTo: str = "Compliance Reviewer"
    dueAt: Optional[str] = None
    isPaidPartnership: bool = False
    score: int = Field(..., ge=0, le=100)
    summary: str
    findings: List[FindingSchema] = []
    knowledgeGaps: List[KnowledgeGapSchema] = []
    versions: List[ReviewVersionSchema] = []
    comments: List[ReviewCommentSchema] = []
    activity: List[ActivityEventSchema] = []
    sourceFileName: Optional[str] = None


# ---------------------------------------------------------
# Authentication & User Schemas (Intra-Backend Support)
# ---------------------------------------------------------

class UserRegisterRequest(BaseModel):
    email: str
    password: str
    brand_id: str
    role: Literal["ADMIN", "REVIEWER", "CREATOR"] = "CREATOR"
    pin_code: Optional[str] = None


class UserLoginRequest(BaseModel):
    email: str
    password: str


class UserProfileResponse(BaseModel):
    id: str
    email: str
    role: str
    brand_id: str


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfileResponse
