from . import llm
from .analyze import analyze_content
from .retrieve import get_chunks
from .schemas import CorrectRequest, CorrectResponse, LLMCorrection
from .verify import norm, verify_citations

SYSTEM = """You fix brand-compliance violations. You get the ORIGINAL text, the VIOLATION, and EVIDENCE chunks.
- Rewrite the original so it complies, changing as little as possible and keeping the meaning and tone.
- Use ONLY facts and rules present in the EVIDENCE. Never add new claims, numbers or names.
- explanation: one or two sentences on what changed and why.
- citations: chunk_id plus a verbatim quote from the evidence that justifies the change."""


class CorrectionError(Exception):
    pass


async def correct(req: CorrectRequest) -> CorrectResponse:
    ids = [c.chunk_id for c in req.finding.citations]
    pool = get_chunks(ids)
    if not pool:
        raise CorrectionError("Cited evidence no longer exists in the knowledge base")
    evidence = "\n\n".join(f"[chunk_id: {c.chunk_id}] {c.document} > {c.section}\n{c.text}" for c in pool.values())
    user = (
        f"ORIGINAL:\n{req.content}\n\nVIOLATION:\n{req.finding.issue}\nRule: {req.finding.rule_violated}\n"
        f"Offending excerpt: {req.finding.excerpt}\n\nEVIDENCE:\n{evidence}"
    )
    out = await llm.generate_structured(SYSTEM, user, LLMCorrection)
    cites = verify_citations(out.citations, pool)
    if not cites:
        raise CorrectionError("Correction rejected: its justification could not be verified against the evidence")
    if norm(out.corrected_text) == norm(req.content):
        raise CorrectionError("Correction rejected: text was not changed")

    verified = None
    if req.recheck:
        # Run the corrected text back through the analyzer; the same rule must not fire again.
        again = await analyze_content(out.corrected_text)
        verified = not any(norm(f.rule_violated) == norm(req.finding.rule_violated) for f in again.findings)
    return CorrectResponse(
        original=req.content, corrected=out.corrected_text.strip(),
        explanation=out.explanation, citations=cites, verified_clean=verified,
    )
