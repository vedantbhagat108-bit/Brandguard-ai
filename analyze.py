import asyncio
import logging
from typing import Optional

from . import claims as claims_module
from . import llm
from .config import settings
from .retrieve import Retrieved, retrieve_for_claims
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    Claim,
    Citation,
    ConfidentialityLevel,
    Finding,
    KnowledgeGap,
    LLMFindings,
    UnsupportedClaim,
    UserRole,
)
from .verify import norm, quote_in_text, verify_citations

logger = logging.getLogger("brandguard.analyze")

SYSTEM_AUDITOR = """You are an Enterprise Brand Compliance and Governance Auditor.
You receive extracted CLAIMS (factual, tonal, terminology) and BRAND CHUNKS (approved facts and style rules).
Report ONLY violations clearly supported by the chunks.

Rules:
1. For chunks of type "approved_fact": Flag any claim that contradicts or misrepresents them.
   - Severity: "critical" (if contradictory or legally sensitive) or "high".
2. For chunks of type "style_rule": Flag tone of voice breaches, forbidden vocabulary, missing trademarks, incorrect naming, passive voice, or hyperbole.
   - Severity: "high" (explicit forbidden rule) or "medium" / "low" (minor stylistic deviation).
3. "excerpt": Copy the exact verbatim text segment from the claim that contains the problem.
4. "citations": You MUST specify the exact "chunk_id" and copy a verbatim "quote" (at least 5 characters) from that chunk. Never invent quotes.
5. "suggested_fix": A concise, brand-compliant rewrite directly grounded in the cited chunk.
6. If the claims are completely compliant with the provided chunks, return {"findings": []}."""


def _build_batch_prompt(claims: list[Claim], pool: dict[str, Retrieved]) -> str:
    chunks_str = "\n\n".join(
        f"[chunk_id: {c.chunk_id}] ({c.doc_type.upper()}) {c.document} > {c.section or 'General'}\n{c.text}"
        for c in pool.values()
    )
    claims_str = "\n".join(
        f"{i + 1}. [Type: {c.claim_type.upper()} | Risk: {c.sensitivity_level}] {c.text}"
        for i, c in enumerate(claims)
    )
    return f"BRAND REPOSITORY CHUNKS:\n{chunks_str}\n\nCLAIMS TO CHECK:\n{claims_str}"


async def _analyze_claim_batch(
    batch_claims: list[Claim],
    batch_pool: dict[str, Retrieved],
    full_content: str,
) -> tuple[list[Finding], int]:
    if not batch_pool:
        return [], 0

    prompt = _build_batch_prompt(batch_claims, batch_pool)
    out: LLMFindings = await llm.generate_structured(
        SYSTEM_AUDITOR,
        prompt,
        LLMFindings,
        retries=1,
    )

    findings: list[Finding] = []
    rejected = 0

    for f in out.findings:
        # Strictly verify citations against pool
        valid_cites = verify_citations(f.citations, batch_pool)
        if not valid_cites or not quote_in_text(f.excerpt, full_content):
            rejected += 1
            continue

        best_sim = max(c.similarity for c in valid_cites)
        # Blended confidence: 70% model confidence + 30% retrieval similarity
        blended_conf = round(0.7 * f.confidence + 0.3 * min(best_sim, 1.0), 2)

        category = "contradiction" if any(c.doc_type == "approved_fact" for c in valid_cites) else f.category

        findings.append(
            Finding(
                issue=f.issue,
                excerpt=f.excerpt.strip(),
                rule_violated=f.rule_violated,
                category=category,
                severity=f.severity,
                confidence=blended_conf,
                citations=valid_cites,
                suggested_fix=f.suggested_fix,
                is_knowledge_gap=False,
            )
        )

    return findings, rejected


async def analyze_content(
    content: str,
    top_k: Optional[int] = None,
    department: Optional[str] = "marketing",
    confidentiality_clearance: ConfidentialityLevel = "internal",
    caller_role: UserRole = "content_creator",
) -> AnalyzeResponse:
    """Core Brand Governance Engine:

    1. LLM Claim Extraction & Content-Type Classification (factual, tonal, terminology)
    2. Hybrid Retrieval with separate pools for approved facts vs style rules
    3. Unsupported-claim and knowledge-gap detection (factual claims with no approved evidence flagged)
    4. Anti-hallucination citation verification & grounded severity scoring
    """
    if not content or len(content.strip()) < 10:
        return AnalyzeResponse(
            findings=[],
            unsupported_claims=[],
            claims_checked=0,
            claims_by_type={"factual": 0, "tonal": 0, "terminology": 0},
            findings_rejected=0,
            warnings=["Content too short for brand governance analysis"],
            knowledge_gaps=[],
        )

    # Step 1: Extract and classify claims
    extracted_claims = await claims_module.extract_and_classify_claims(content)
    if not extracted_claims:
        return AnalyzeResponse(
            findings=[],
            unsupported_claims=[],
            claims_checked=0,
            claims_by_type={"factual": 0, "tonal": 0, "terminology": 0},
            findings_rejected=0,
            warnings=["No verifiable claims detected in content"],
            knowledge_gaps=[],
        )

    claims_by_type = {
        "factual": sum(1 for c in extracted_claims if c.claim_type == "factual"),
        "tonal": sum(1 for c in extracted_claims if c.claim_type == "tonal"),
        "terminology": sum(1 for c in extracted_claims if c.claim_type == "terminology"),
    }

    # Step 2: Query brand knowledge (separate pools for approved facts vs style rules)
    retrieved_map = await retrieve_for_claims(
        extracted_claims,
        department=department,
        confidentiality_clearance=confidentiality_clearance,
        top_k=top_k,
    )

    findings: list[Finding] = []
    unsupported_claims: list[UnsupportedClaim] = []
    knowledge_gaps: list[KnowledgeGap] = []
    claims_for_llm: list[Claim] = []
    combined_pool: dict[str, Retrieved] = {}

    # Step 3: Unsupported-claim and Knowledge-gap Detection
    # Factual claims with no approved-fact evidence must NOT pass silently!
    for claim in extracted_claims:
        hits = retrieved_map.get(claim.claim_id, [])
        for h in hits:
            combined_pool.setdefault(h.chunk_id, h)

        if claim.claim_type == "factual":
            fact_hits = [h for h in hits if h.doc_type == "approved_fact"]
            highest_fact_sim = max((h.similarity for h in fact_hits), default=0.0)

            # Check if threshold is breached (no evidence or low similarity)
            if not fact_hits or highest_fact_sim < settings.unsupported_claim_threshold:
                best_doc = fact_hits[0].document if fact_hits else None
                reason_msg = (
                    f"Factual claim has no verified evidence in approved facts repository "
                    f"(Highest match: {highest_fact_sim:.2f} < threshold {settings.unsupported_claim_threshold:.2f})."
                )
                action_msg = "Submit verified documentation to brand legal repository, or remove unsubstantiated figure/claim."

                unsupported = UnsupportedClaim(
                    claim_id=claim.claim_id,
                    claim_text=claim.text,
                    excerpt=claim.excerpt,
                    reason=reason_msg,
                    highest_similarity=highest_fact_sim,
                    best_candidate_document=best_doc,
                    action_required=action_msg,
                )
                unsupported_claims.append(unsupported)

                # Add explicit Finding for visibility in audit report
                severity = "critical" if claim.sensitivity_level in ("high_risk", "legal_sensitive") else "high"
                findings.append(
                    Finding(
                        issue=f"Unsupported Factual Claim: '{claim.text}'",
                        excerpt=claim.excerpt,
                        rule_violated="Enterprise Brand Fact Policy: All factual assertions, SLAs, and performance metrics must be substantiated by approved facts in the brand repository before publication.",
                        category="unsupported_claim",
                        severity=severity,
                        confidence=0.95,
                        citations=[],
                        suggested_fix=f"Provide documentation to add this claim to approved facts, or rephrase '{claim.text}' without unverified figures.",
                        is_knowledge_gap=True,
                    )
                )

                # Flag as Knowledge Gap for brand knowledge curators
                knowledge_gaps.append(
                    KnowledgeGap(
                        topic=f"Missing Brand Fact for claim: '{claim.text[:80]}'",
                        claim_excerpt=claim.excerpt,
                        recommended_action=f"Verify claim with SME and ingest approved documentation for department '{department}'.",
                    )
                )
            else:
                # Factual claim has candidate chunks; check for contradictions
                claims_for_llm.append(claim)
        else:
            # Tonal and terminology claims check against style rules
            if hits:
                claims_for_llm.append(claim)

    # Step 4: Batch LLM Comparison for rule violations & contradictions
    rejected_count = 0
    warnings: list[str] = []

    if claims_for_llm and combined_pool:
        batch_size = settings.claims_per_batch
        sem = asyncio.Semaphore(3)

        async def run_batch(batch: list[Claim]):
            async with sem:
                batch_cids = {c.claim_id for c in batch}
                batch_subpool: dict[str, Retrieved] = {}
                for cid in batch_cids:
                    for h in retrieved_map.get(cid, []):
                        batch_subpool[h.chunk_id] = h
                return await _analyze_claim_batch(batch, batch_subpool, content)

        batches = [claims_for_llm[i : i + batch_size] for i in range(0, len(claims_for_llm), batch_size)]
        results = await asyncio.gather(*[run_batch(b) for b in batches], return_exceptions=True)

        for res in results:
            if isinstance(res, Exception):
                logger.error(f"Analysis batch exception: {res}")
                warnings.append(f"Analysis batch encountered warning: {res}")
                continue
            batch_findings, batch_rejected = res
            findings.extend(batch_findings)
            rejected_count += batch_rejected

    # Deduplicate findings
    seen_findings = set()
    unique_findings: list[Finding] = []
    for f in findings:
        key = (norm(f.excerpt), norm(f.rule_violated))
        if key not in seen_findings:
            seen_findings.add(key)
            unique_findings.append(f)

    # Sort findings: critical -> high -> medium -> low, then by confidence
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    unique_findings.sort(key=lambda f: (severity_order.get(f.severity, 4), -f.confidence))

    return AnalyzeResponse(
        findings=unique_findings,
        unsupported_claims=unsupported_claims,
        claims_checked=len(extracted_claims),
        claims_by_type=claims_by_type,
        findings_rejected=rejected_count,
        warnings=warnings,
        knowledge_gaps=knowledge_gaps,
    )
