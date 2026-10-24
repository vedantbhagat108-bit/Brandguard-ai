from typing import Literal, Optional
from pydantic import BaseModel, Field

DocType = Literal["style_rule", "approved_fact"]
Severity = Literal["low", "medium", "high", "critical"]


# ---------- what the LLM must return ----------
class LLMCitation(BaseModel):
    chunk_id: str
    quote: str = Field(min_length=5)


class LLMFinding(BaseModel):
    issue: str
    excerpt: str = Field(min_length=3)
    rule_violated: str
    severity: Severity
    confidence: float = Field(ge=0, le=1)
    citations: list[LLMCitation] = Field(min_length=1)
    suggested_fix: Optional[str] = None


class LLMFindings(BaseModel):
    findings: list[LLMFinding] = []


class LLMCorrection(BaseModel):
    corrected_text: str = Field(min_length=1)
    explanation: str
    citations: list[LLMCitation] = Field(min_length=1)


# ---------- what the API returns ----------
class Citation(BaseModel):
    chunk_id: str
    document: str
    section: str = ""
    page: Optional[int] = None
    doc_type: DocType
    quote: str


class Finding(BaseModel):
    issue: str
    excerpt: str
    rule_violated: str
    severity: Severity
    confidence: float = Field(ge=0, le=1)
    citations: list[Citation]
    suggested_fix: Optional[str] = None


class AnalyzeRequest(BaseModel):
    content: str = Field(min_length=10)
    top_k: Optional[int] = Field(default=None, ge=1, le=10)


class AnalyzeResponse(BaseModel):
    findings: list[Finding]
    claims_checked: int
    findings_rejected: int  # failed citation / excerpt verification
    warnings: list[str] = []


class CorrectRequest(BaseModel):
    content: str = Field(min_length=3, description="Text to fix (the excerpt or its sentence)")
    finding: Finding
    recheck: bool = True


class CorrectResponse(BaseModel):
    original: str
    corrected: str
    explanation: str
    citations: list[Citation]
    verified_clean: Optional[bool] = None


class IngestResponse(BaseModel):
    document: str
    doc_type: DocType
    chunks: int
