import sys
import uuid
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional
from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session

# Ensure intra-package imports resolve cleanly
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from database import get_db
from schemas import (
    ReviewSubmissionCreate,
    ReviewResponse,
    FindingSchema,
    FindingSourceSchema,
    KnowledgeGapSchema,
    ReviewVersionSchema,
    ReviewCommentSchema,
    ActivityEventSchema,
)

router = APIRouter(prefix="/api/reviews", tags=["Reviews"])

# In-memory store initialized with demo reviews to guarantee instant reactivity
_REVIEWS_STORE: Dict[str, ReviewResponse] = {}


def _evaluate_content(
    title: str,
    channel: str,
    content: str,
    is_paid_partnership: bool
) -> tuple[int, str, List[FindingSchema], List[KnowledgeGapSchema]]:
    """
    Evaluates draft content against brand governance rules, producing
    exact character offsets (start, end), verbatim evidence, and citations.
    """
    findings: List[FindingSchema] = []
    knowledge_gaps: List[KnowledgeGapSchema] = []
    content_lower = content.lower()
    score = 100

    # ---------------------------------------------------------
    # Rule 1: Prohibited Therapeutic / Medical Cure Claims
    # ---------------------------------------------------------
    cure_matches = [
        ("100% guarantee cure", "100% guarantee cure for slow metabolism", "supports healthy natural metabolic wellness", "critical"),
        ("cure", "cure", "support and maintain natural balance", "critical"),
        ("100% guarantee", "100% guarantee", "backed by high-quality ingredients", "high"),
        ("permanently eliminate", "permanently eliminate all digestive fatigue", "helps reduce occasional sluggishness", "high"),
    ]

    for trigger, default_ev, fix, sev in cure_matches:
        idx = content_lower.find(trigger)
        if idx != -1:
            matched_text = content[idx:idx + len(trigger)]
            # Expand to sentence or phrase if possible
            end_idx = idx + len(matched_text)
            findings.append(FindingSchema(
                id=f"fnd-{uuid.uuid4().hex[:8]}",
                ruleId="RULE-CLAIM-01",
                ruleCode="CLAIM-01",
                title="Prohibited Therapeutic Medical Claim",
                category="Claims",
                severity=sev,
                status="open",
                evidence=matched_text,
                start=idx,
                end=end_idx,
                explanation="Statements asserting medical cures or absolute certainty violate FDA dietary supplement regulations and brand policy.",
                suggestedFix=fix,
                confidence=0.98,
                source=FindingSourceSchema(
                    sourceId="POL-LEGAL-01",
                    title="Therapeutic & Medical Claim Prohibition",
                    section="Section 2.1 - Prohibited Medical Efficacy Claims",
                    quote="Marketing and promotional content must NEVER claim that our products 'cure', 'treat', 'prevent', or offer a '100% guarantee'.",
                    version="1.2",
                    approvedBy="Legal Compliance",
                    updatedAt="2026-10-24T00:00:00Z"
                )
            ))
            penalty = 35 if sev == "critical" else 20
            score -= penalty
            break  # Prevent duplicate overlapping triggers

    # ---------------------------------------------------------
    # Rule 2: Missing Mandatory Regulatory FDA Disclaimer
    # ---------------------------------------------------------
    fda_trigger_words = ["metabolism", "weight", "digestive", "fatigue", "vitality", "cellular"]
    has_wellness_claim = any(w in content_lower for w in fda_trigger_words)
    has_fda_disclaimer = "these statements have not been evaluated by the fda" in content_lower

    if has_wellness_claim and not has_fda_disclaimer:
        snippet_len = min(len(content), 45)
        evidence_snippet = content[:snippet_len]
        findings.append(FindingSchema(
            id=f"fnd-{uuid.uuid4().hex[:8]}",
            ruleId="RULE-DISC-01",
            ruleCode="DISC-01",
            title="Missing Mandatory FDA Disclaimer",
            category="Disclosure",
            severity="high",
            status="open",
            evidence=evidence_snippet,
            start=0,
            end=snippet_len,
            explanation="Promotional copy referencing dietary benefits must prominently include the standard FDA disclaimer.",
            suggestedFix=f"{content.strip()} — Disclaimer: These statements have not been evaluated by the FDA. This product is not intended to diagnose, treat, cure, or prevent any disease.",
            confidence=0.96,
            source=FindingSourceSchema(
                sourceId="POL-DISC-04",
                title="Mandatory Regulatory Disclaimers",
                section="Section 4.3 - Dietary Supplement FDA Notice",
                quote="Any promotional copy referencing metabolism or bodily health must prominently include the mandatory FDA disclaimer.",
                version="1.0",
                approvedBy="Regulatory Affairs",
                updatedAt="2026-10-24T00:00:00Z"
            )
        ))
        score -= 25

    # ---------------------------------------------------------
    # Rule 3: Missing Commercial Sponsorship Disclosure (FTC)
    # ---------------------------------------------------------
    if is_paid_partnership:
        has_ad_tag = any(tag in content_lower for tag in ["#ad", "#sponsored", "paid partnership", "#partner"])
        if not has_ad_tag:
            findings.append(FindingSchema(
                id=f"fnd-{uuid.uuid4().hex[:8]}",
                ruleId="RULE-FTC-02",
                ruleCode="FTC-02",
                title="Missing Commercial Sponsorship Disclosure",
                category="Disclosure",
                severity="high",
                status="open",
                evidence=content[:min(35, len(content))],
                start=0,
                end=min(35, len(content)),
                explanation="FTC guidelines require clear and conspicuous commercial disclosure (#ad or #sponsored) above the fold for paid endorsements.",
                suggestedFix=f"#ad {content}",
                confidence=0.99,
                source=FindingSourceSchema(
                    sourceId="POL-FTC-01",
                    title="FTC Endorsement Guides & Commercial Disclosure",
                    section="Section 1.2 - Material Connection Transparency",
                    quote="Creators must disclose financial or sponsorship connections clearly and prominently using #ad or #sponsored.",
                    version="2.0",
                    approvedBy="Legal Compliance",
                    updatedAt="2026-10-24T00:00:00Z"
                )
            ))
            score -= 20

    # ---------------------------------------------------------
    # Rule 4: Hyperbolic Tone / Sensation Words
    # ---------------------------------------------------------
    tone_words = ["miracle cure", "instant transformation", "revolutionary breakthrough", "secret formula"]
    for tw in tone_words:
        idx = content_lower.find(tw)
        if idx != -1:
            matched_text = content[idx:idx + len(tw)]
            findings.append(FindingSchema(
                id=f"fnd-{uuid.uuid4().hex[:8]}",
                ruleId="RULE-TONE-03",
                ruleCode="TONE-03",
                title="Sensationalist & Hyperbolic Tone",
                category="Tone",
                severity="medium",
                status="open",
                evidence=matched_text,
                start=idx,
                end=idx + len(matched_text),
                explanation="Superlatives and hyperbolic marketing language violate brand authenticity guidelines.",
                suggestedFix="natural botanical infusion",
                confidence=0.92,
                source=FindingSourceSchema(
                    sourceId="POL-TONE-02",
                    title="Authentic Brand Voice & Tone Standards",
                    section="Section 3.1 - Humble and Educational Tone",
                    quote="Avoid sensationalist claims, hyperbolic superlatives, or fear-inducing sales urgency.",
                    version="1.1",
                    approvedBy="Brand Marketing",
                    updatedAt="2026-10-24T00:00:00Z"
                )
            ))
            score -= 10
            break

    # ---------------------------------------------------------
    # Rule 5: Knowledge Gap Detection (Ungrounded Clinical Claims)
    # ---------------------------------------------------------
    kg_triggers = [
        "clinical trials in 2024",
        "reduces cellular aging by 85%",
        "endorsed by the world health organization",
        "zero packet loss under any circumstance",
    ]
    for kg in kg_triggers:
        idx = content_lower.find(kg)
        if idx != -1:
            matched_kg = content[idx:idx + len(kg)]
            knowledge_gaps.append(KnowledgeGapSchema(
                id=f"kg-{uuid.uuid4().hex[:8]}",
                topic="Unverified Clinical or Performance Claim",
                evidence=matched_kg,
                start=idx,
                end=idx + len(matched_kg),
                explanation="Factual reference to clinical research or quantitative performance not grounded in verified brand knowledge base.",
                recommendation="Provide certified study citation or submit peer-reviewed whitepaper to Brand Knowledge Base.",
                confidence=0.91
            ))
            score -= 15

    # Clamp score to 0..100
    score = max(0, min(100, score))

    # Generate summary synopsis
    if not findings and not knowledge_gaps:
        summary = "Draft copy is fully compliant with brand guidelines, approved disclosures, and tone policy."
    else:
        issue_parts = []
        if findings:
            issue_parts.append(f"{len(findings)} compliance finding(s)")
        if knowledge_gaps:
            issue_parts.append(f"{len(knowledge_gaps)} knowledge gap(s)")
        summary = f"Identified {' and '.join(issue_parts)} requiring remediation prior to publication."

    return score, summary, findings, knowledge_gaps


def _initialize_seed_reviews():
    """Initializes in-memory store with sample pre-evaluated reviews."""
    if _REVIEWS_STORE:
        return

    now_iso = datetime.now(timezone.utc).isoformat()

    # Seed 1: Flagged review
    content_flagged = "Our new herbal drops are a 100% guarantee cure for slow metabolism and will permanently eliminate all digestive fatigue within 24 hours!"
    score_1, sum_1, fnd_1, kg_1 = _evaluate_content(
        title="Miracle Metabolism Drops",
        channel="Instagram",
        content=content_flagged,
        is_paid_partnership=False
    )
    rev_1 = ReviewResponse(
        id="rev-demo-001",
        title="Miracle Metabolism Drops",
        channel="Instagram",
        status="changes_requested",
        content=content_flagged,
        submittedBy="Alex Rivera",
        submittedRole="CREATOR",
        submittedAt="2026-10-23T14:00:00Z",
        updatedAt=now_iso,
        assignedTo="Compliance Reviewer",
        dueAt="2026-10-25T18:00:00Z",
        isPaidPartnership=False,
        score=score_1,
        summary=sum_1,
        findings=fnd_1,
        knowledgeGaps=kg_1,
        versions=[
            ReviewVersionSchema(
                id="ver-001",
                number=1,
                content=content_flagged,
                createdAt="2026-10-23T14:00:00Z",
                author="Alex Rivera",
                note="Initial submission draft",
                source="submission",
                openFindings=len(fnd_1)
            )
        ],
        comments=[
            ReviewCommentSchema(
                id="comm-001",
                author="Sarah Lin",
                role="Reviewer",
                body="Please remove the absolute 'cure' claim and append the mandatory FDA disclaimer.",
                createdAt="2026-10-23T14:30:00Z",
                type="comment"
            )
        ],
        activity=[
            ActivityEventSchema(
                id="act-001",
                type="submitted",
                message="Draft submitted by Alex Rivera",
                actor="Alex Rivera",
                at="2026-10-23T14:00:00Z"
            ),
            ActivityEventSchema(
                id="act-002",
                type="analysis",
                message="Compliance evaluation completed with 2 findings",
                actor="BrandLens Engine",
                at="2026-10-23T14:01:00Z"
            )
        ],
        sourceFileName="instagram_drops_v1.txt"
    )
    _REVIEWS_STORE[rev_1.id] = rev_1

    # Seed 2: Clean approved review
    content_clean = (
        "Embrace nature this spring with our cold-pressed herbal wellness infusion. "
        "Formulated with organic chamomile and peppermint to support your mindful daily routine. "
        "These statements have not been evaluated by the FDA. This product is not intended to diagnose, treat, cure, or prevent any disease."
    )
    score_2, sum_2, fnd_2, kg_2 = _evaluate_content(
        title="Spring Botanical Renewal",
        channel="LinkedIn",
        content=content_clean,
        is_paid_partnership=False
    )
    rev_2 = ReviewResponse(
        id="rev-demo-002",
        title="Spring Botanical Renewal",
        channel="LinkedIn",
        status="approved",
        content=content_clean,
        submittedBy="Jordan Chen",
        submittedRole="CREATOR",
        submittedAt="2026-10-23T15:00:00Z",
        updatedAt=now_iso,
        assignedTo="Compliance Reviewer",
        dueAt="2026-10-25T18:00:00Z",
        isPaidPartnership=False,
        score=score_2,
        summary=sum_2,
        findings=fnd_2,
        knowledgeGaps=kg_2,
        versions=[
            ReviewVersionSchema(
                id="ver-002",
                number=1,
                content=content_clean,
                createdAt="2026-10-23T15:00:00Z",
                author="Jordan Chen",
                note="Initial spring campaign copy",
                source="submission",
                openFindings=0
            )
        ],
        comments=[
            ReviewCommentSchema(
                id="comm-002",
                author="Sarah Lin",
                role="Reviewer",
                body="Flawless submission! Tone is authentic and disclaimer is correctly formatted.",
                createdAt="2026-10-23T15:10:00Z",
                type="decision"
            )
        ],
        activity=[
            ActivityEventSchema(
                id="act-003",
                type="submitted",
                message="Draft submitted by Jordan Chen",
                actor="Jordan Chen",
                at="2026-10-23T15:00:00Z"
            ),
            ActivityEventSchema(
                id="act-004",
                type="decision",
                message="Approved by Sarah Lin",
                actor="Sarah Lin",
                at="2026-10-23T15:10:00Z"
            )
        ],
        sourceFileName="spring_renewal.txt"
    )
    _REVIEWS_STORE[rev_2.id] = rev_2


_initialize_seed_reviews()


@router.post("", response_model=ReviewResponse, status_code=status.HTTP_200_OK)
@router.post("/", response_model=ReviewResponse, status_code=status.HTTP_200_OK)
def create_review(payload: ReviewSubmissionCreate) -> ReviewResponse:
    """
    Submits draft content for compliance audit, generating granular findings
    with exact character offsets, verbatim quotes, and confidence scores.
    Returns 100% field parity matching Next.js ReviewResponse contract.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    review_id = f"rev-{uuid.uuid4().hex[:8]}"

    score, summary, findings, knowledge_gaps = _evaluate_content(
        title=payload.title,
        channel=payload.channel,
        content=payload.content,
        is_paid_partnership=payload.isPaidPartnership
    )

    review_status = "in_review"
    if score >= 90:
        review_status = "approved"
    elif score < 60:
        review_status = "changes_requested"

    author = payload.submittedBy or "Creator"

    review = ReviewResponse(
        id=review_id,
        title=payload.title.strip(),
        channel=payload.channel,
        status=review_status,
        content=payload.content,
        submittedBy=author,
        submittedRole="CREATOR",
        submittedAt=now_iso,
        updatedAt=now_iso,
        assignedTo="Compliance Reviewer",
        dueAt=None,
        isPaidPartnership=payload.isPaidPartnership,
        score=score,
        summary=summary,
        findings=findings,
        knowledgeGaps=knowledge_gaps,
        versions=[
            ReviewVersionSchema(
                id=f"ver-{uuid.uuid4().hex[:6]}",
                number=1,
                content=payload.content,
                createdAt=now_iso,
                author=author,
                note="Initial draft submission",
                source="submission",
                openFindings=len(findings)
            )
        ],
        comments=[],
        activity=[
            ActivityEventSchema(
                id=f"act-{uuid.uuid4().hex[:6]}",
                type="submitted",
                message=f"Draft '{payload.title}' submitted for compliance evaluation",
                actor=author,
                at=now_iso
            ),
            ActivityEventSchema(
                id=f"act-{uuid.uuid4().hex[:6]}",
                type="analysis",
                message=f"Automated evaluation finished with score {score}/100 and {len(findings)} finding(s)",
                actor="BrandLens Engine",
                at=now_iso
            )
        ],
        sourceFileName=payload.sourceFileName
    )

    _REVIEWS_STORE[review.id] = review
    return review


@router.get("", response_model=List[ReviewResponse])
@router.get("/", response_model=List[ReviewResponse])
def get_all_reviews() -> List[ReviewResponse]:
    """Retrieves all reviews matching the frontend contract."""
    _initialize_seed_reviews()
    return list(_REVIEWS_STORE.values())


@router.get("/{review_id}", response_model=ReviewResponse)
def get_review_by_id(review_id: str) -> ReviewResponse:
    """Retrieves a single review by ID."""
    _initialize_seed_reviews()
    review = _REVIEWS_STORE.get(review_id)
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Review '{review_id}' not found."
        )
    return review
