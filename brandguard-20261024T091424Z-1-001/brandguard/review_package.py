import uuid
from datetime import datetime
from typing import Optional

from .analyze import analyze_content
from .claims import extract_and_classify_claims
from .schemas import (
    ChangeHistoryEntry,
    Citation,
    ConfidentialityLevel,
    Finding,
    KnowledgeGap,
    ReviewPackage,
    ReviewPackageRequest,
    ReviewPackageSummary,
    SuggestedEdit,
    UnsupportedClaim,
    UserRole,
)


def _compute_compliance_score(findings: list[Finding], unsupported: list[UnsupportedClaim]) -> float:
    """Computes a 0-100 brand compliance score based on weighted issue severity."""
    score = 100.0
    for f in findings:
        if f.severity == "critical":
            score -= 25.0
        elif f.severity == "high":
            score -= 15.0
        elif f.severity == "medium":
            score -= 6.0
        elif f.severity == "low":
            score -= 2.0

    # Additional penalty for ungrounded knowledge gaps
    for _ in unsupported:
        score -= 10.0

    return max(0.0, round(score, 1))


def _determine_recommendation(score: float, findings: list[Finding], unsupported: list[UnsupportedClaim]) -> str:
    has_critical = any(f.severity == "critical" for f in findings) or len(unsupported) > 0
    if has_critical or score < 60.0:
        return "BLOCKED_CRITICAL"
    if score >= 92.0 and not any(f.severity in ("critical", "high") for f in findings):
        return "APPROVED"
    return "NEEDS_REVISION"


# In-memory package store (can be persisted to PostgreSQL review_packages table)
_packages: dict[str, ReviewPackage] = {}


def save_package(pkg: ReviewPackage):
    _packages[pkg.package_id] = pkg


def get_package(pkg_id: str) -> Optional[ReviewPackage]:
    return _packages.get(pkg_id)


def list_packages() -> list[ReviewPackage]:
    return list(_packages.values())


async def generate_review_package(req: ReviewPackageRequest) -> ReviewPackage:
    """Creates a comprehensive Brand Governance Review Package (Step 8 of Two-RAG Workflow):

    - Summary of findings & compliance scoring
    - Source links and verified knowledge citations
    - Suggested inline edits preserving brand voice
    - Knowledge-gap flags and unsupported claim detection
    - Change history and initial review state
    """
    pkg_id = f"pkg-{uuid.uuid4().hex[:10]}"
    now = datetime.utcnow().isoformat()

    # Step 1: Extract claims
    extracted_claims = await extract_and_classify_claims(req.content)

    # Step 2: Run governance analysis
    analysis = await analyze_content(
        content=req.content,
        department=req.department,
        confidentiality_clearance=req.confidentiality_clearance,
        caller_role=req.caller_role,
    )

    # Step 3: Compute metrics and recommendations
    score = _compute_compliance_score(analysis.findings, analysis.unsupported_claims)
    rec = _determine_recommendation(score, analysis.findings, analysis.unsupported_claims)

    sev_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for f in analysis.findings:
        sev_counts[f.severity] = sev_counts.get(f.severity, 0) + 1

    summary = ReviewPackageSummary(
        total_claims=analysis.claims_checked,
        claims_by_type=analysis.claims_by_type,
        findings_by_severity=sev_counts,
        unsupported_claims_count=len(analysis.unsupported_claims),
        knowledge_gaps_count=len(analysis.knowledge_gaps),
        compliance_score=score,
        publication_recommendation=rec,
    )

    # Step 4: Aggregate distinct source links
    seen_sources = set()
    source_links: list[Citation] = []
    for f in analysis.findings:
        for c in f.citations:
            key = (c.chunk_id, c.document)
            if key not in seen_sources:
                seen_sources.add(key)
                source_links.append(c)

    # Step 5: Format suggested edits
    suggested_edits: list[SuggestedEdit] = []
    for f in analysis.findings:
        if f.suggested_fix:
            suggested_edits.append(
                SuggestedEdit(
                    original_excerpt=f.excerpt,
                    suggested_text=f.suggested_fix,
                    reason=f.issue,
                    rule_violated=f.rule_violated,
                    citations=f.citations,
                )
            )

    # Step 6: Initial change history entry
    change_history = [
        ChangeHistoryEntry(
            timestamp=now,
            action="CREATED_PACKAGE",
            actor=req.creator_id,
            actor_role=req.caller_role,
            notes=f"Initial brand governance review package created. Score: {score}%, Recommendation: {rec}",
        )
    ]

    package = ReviewPackage(
        package_id=pkg_id,
        title=req.title or "Brand Governance Review Package",
        content_raw=req.content,
        created_at=now,
        creator_id=req.creator_id,
        workflow_status="pending_manager" if score < 95.0 else "pending_reviewer",
        summary=summary,
        claims=extracted_claims,
        findings=analysis.findings,
        unsupported_claims=analysis.unsupported_claims,
        knowledge_gaps=analysis.knowledge_gaps,
        source_links=source_links,
        suggested_edits=suggested_edits,
        change_history=change_history,
    )

    save_package(package)
    return package
