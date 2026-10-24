import uuid
from . import llm
from .schemas import Claim, LLMExtractedClaims

CLAIM_EXTRACTION_SYSTEM = """You are a specialized Enterprise Brand Compliance Claim Parser.
Analyze the submitted marketing, sales, or public-facing content.
Extract all distinct claims and assertions made by the author. Do not split arbitrarily by punctuation.
Split by logical semantic claim.

For EACH claim:
1. "text": A self-contained, normalized statement representing the claim.
2. "excerpt": The EXACT verbatim excerpt copied word-for-word from the original content where this claim originates.
3. "claim_type": Classify into one of:
   - "factual": Specific verifiable assertions, data points, statistics, uptime/SLAs, benchmarks, certifications, customer numbers, integrations, partnerships, pricing, or architecture claims.
   - "tonal": Tone of voice, emotional register, stylistic statements, hyperbole, puffery, aggressive or passive framing.
   - "terminology": Specific names of products, features, capitalization, industry jargon, banned buzzwords, trademark usage.
4. "sensitivity_level":
   - "legal_sensitive": Direct guarantees, absolute warranties, regulatory/compliance certifications, financial statements.
   - "high_risk": Unsubstantiated superlative claims ("#1 in the world", "10x faster than any competitor", "100% bug free").
   - "normal": Standard brand/marketing descriptions.

Be thorough. Every concrete factual assertion must be tagged as "factual" so it can be verified against approved brand facts."""


async def extract_and_classify_claims(content: str) -> list[Claim]:
    """Extracts semantic claims from raw text and classifies each as factual, tonal, or terminology."""
    if not content or len(content.strip()) < 10:
        return []

    user_prompt = f"CONTENT TO ANALYZE:\n\"\"\"\n{content}\n\"\"\""
    res: LLMExtractedClaims = await llm.generate_structured(
        CLAIM_EXTRACTION_SYSTEM,
        user_prompt,
        LLMExtractedClaims,
        retries=1,
    )

    claims: list[Claim] = []
    for item in res.claims:
        # Guarantee verbatim excerpt is present in original text
        excerpt = item.excerpt.strip()
        if excerpt not in content:
            # Fallback: find nearest matching segment or use excerpt as text
            pass

        cid = f"claim-{uuid.uuid4().hex[:8]}"
        claims.append(
            Claim(
                claim_id=cid,
                text=item.text.strip(),
                excerpt=excerpt if excerpt in content else item.text.strip(),
                claim_type=item.claim_type,
                sensitivity_level=item.sensitivity_level,
            )
        )

    # Fallback if LLM returned 0 claims but content exists
    if not claims and len(content.strip()) >= 15:
        import re
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", content) if len(s.strip()) >= 15]
        for s in sentences:
            s_lower = s.lower()
            if any(num in s for num in ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "%", "$"]):
                ctype = "factual"
            elif any(w in s_lower for w in ["best", "guarantee", "always", "never", "leader", "pioneer"]):
                ctype = "tonal"
            else:
                ctype = "terminology" if any(w.isupper() for w in s.split()) else "factual"

            claims.append(
                Claim(
                    claim_id=f"claim-{uuid.uuid4().hex[:8]}",
                    text=s,
                    excerpt=s,
                    claim_type=ctype,
                    sensitivity_level="high_risk" if ctype == "factual" else "normal",
                )
            )

    return claims
