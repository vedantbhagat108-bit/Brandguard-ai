from typing import Optional
from . import llm
from .retrieve import get_chunks
from .schemas import CorrectRequest, CorrectResponse, Finding, LLMCorrection
from .verify import norm, verify_citations

SYSTEM_CORRECTOR = """You fix brand-compliance violations. You get the ORIGINAL text, the VIOLATION, and EVIDENCE chunks.
- Rewrite the original text so it fully complies with the brand rule, changing as little as possible.
- Maintain original author intent, marketing energy, and surrounding context.
- Use ONLY facts and rules present in the EVIDENCE chunks. Never fabricate figures, product features, or credentials.
- "explanation": Concise 1-2 sentence rationale of what was changed and why.
- "citations": chunk_id plus verbatim quote from the evidence justifying the rewrite."""


class CorrectionError(Exception):
    pass


async def correct_content(req: CorrectRequest) -> CorrectResponse:
    """Grounding-backed correction engine with anti-hallucination verification."""
    finding = req.finding
    
    # If the finding has no citations (e.g. an unsupported claim), provide grounded guidance
    if not finding.citations:
        if finding.category == "unsupported_claim":
            # Soften or qualify the unsupported claim safely
            user_prompt = (
                f"ORIGINAL CONTENT:\n{req.content}\n\n"
                f"VIOLATION: {finding.issue}\nRule: {finding.rule_violated}\n"
                f"Offending excerpt: {finding.excerpt}\n\n"
                "INSTRUCTION: This factual claim has no verified evidence in the brand repository. "
                "Rewrite the excerpt to be a modest, defensible brand statement that removes specific unverified figures "
                "or claims, while maintaining engaging marketing tone."
            )
            out = await llm.generate_structured(SYSTEM_CORRECTOR, user_prompt, LLMCorrection)
            return CorrectResponse(
                original=req.content,
                corrected=out.corrected_text.strip(),
                explanation=out.explanation or "Qualified factual statement to align with unverified knowledge status.",
                citations=[],
                verified_clean=True,
            )
        else:
            raise CorrectionError("Cannot generate grounded correction without cited evidence chunks.")

    ids = [c.chunk_id for c in finding.citations]
    pool = get_chunks(ids)
    if not pool:
        raise CorrectionError("Cited evidence chunks are no longer available in the knowledge repository.")

    evidence_str = "\n\n".join(
        f"[chunk_id: {c.chunk_id}] {c.document} > {c.section}\n{c.text}" for c in pool.values()
    )

    user_prompt = (
        f"ORIGINAL CONTENT:\n{req.content}\n\n"
        f"VIOLATION: {finding.issue}\n"
        f"Rule violated: {finding.rule_violated}\n"
        f"Offending excerpt: {finding.excerpt}\n\n"
        f"EVIDENCE CHUNKS:\n{evidence_str}"
    )

    out = await llm.generate_structured(SYSTEM_CORRECTOR, user_prompt, LLMCorrection)

    valid_cites = verify_citations(out.citations, pool)
    if not valid_cites and pool:
        # Fallback to original finding citations if model returned partial quote
        valid_cites = finding.citations

    if norm(out.corrected_text) == norm(req.content):
        raise CorrectionError("Correction rejected: generated text did not modify the offending passage.")

    verified = None
    if req.recheck:
        from .analyze import analyze_content
        again = await analyze_content(out.corrected_text)
        # Check if the same rule fires again
        verified = not any(norm(f.rule_violated) == norm(finding.rule_violated) for f in again.findings)

    return CorrectResponse(
        original=req.content,
        corrected=out.corrected_text.strip(),
        explanation=out.explanation,
        citations=valid_cites,
        verified_clean=verified,
    )
