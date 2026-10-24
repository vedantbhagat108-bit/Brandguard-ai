import asyncio
import re

from . import llm
from .config import settings
from .retrieve import Retrieved, retrieve_many
from .schemas import AnalyzeResponse, Finding, LLMFindings
from .verify import norm, quote_in_text, verify_citations

SYSTEM = """You are a brand-compliance auditor. You receive CLAIMS from marketing content and BRAND CHUNKS \
(style rules and approved facts). Report ONLY violations clearly supported by the chunks.

Rules:
- Use ONLY the provided chunks. Never invent rules or facts. If nothing is violated, return {"findings": []}.
- "excerpt" must be copied verbatim from the claim.
- Each citation: "chunk_id" from the chunks, and "quote" copied verbatim from that chunk (the exact rule or fact).
- Chunks of type approved_fact: flag claims that contradict them. Chunks of type style_rule: flag tone/wording/usage breaches.
- severity: critical = false/legal-risk claim or contradicts an approved fact; high = clear explicit rule breach; \
medium = notable deviation; low = minor stylistic issue.
- confidence: 0-1, how sure you are the claim breaks the cited rule.
- suggested_fix: a short rewrite grounded in the cited chunk, or null."""


def split_claims(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", text)
    return [p.strip() for p in parts if len(p.strip()) >= 15]


def _build_prompt(claims: list[str], pool: dict[str, Retrieved]) -> str:
    chunks = "\n\n".join(
        f"[chunk_id: {c.chunk_id}] ({c.doc_type}) {c.document} > {c.section or 'n/a'}\n{c.text}"
        for c in pool.values()
    )
    numbered = "\n".join(f"{i + 1}. {c}" for i, c in enumerate(claims))
    return f"BRAND CHUNKS:\n{chunks}\n\nCLAIMS TO CHECK:\n{numbered}"


async def _analyze_batch(claims, retrieved) -> tuple[list[Finding], int]:
    pool: dict[str, Retrieved] = {}
    for hits in retrieved:
        for h in hits:
            pool.setdefault(h.chunk_id, h)
    if not pool:
        return [], 0
    out = await llm.generate_structured(SYSTEM, _build_prompt(claims, pool), LLMFindings)
    batch_text = " ".join(claims)
    findings, rejected = [], 0
    for f in out.findings:
        cites = verify_citations(f.citations, pool)
        if not cites or not quote_in_text(f.excerpt, batch_text):
            rejected += 1
            continue
        best_sim = max(pool[c.chunk_id].similarity for c in cites)
        conf = round(0.7 * f.confidence + 0.3 * min(best_sim, 1.0), 2)  # blend model + retrieval signal
        findings.append(
            Finding(
                issue=f.issue, excerpt=f.excerpt.strip(), rule_violated=f.rule_violated,
                severity=f.severity, confidence=conf, citations=cites, suggested_fix=f.suggested_fix,
            )
        )
    return findings, rejected


async def analyze_content(content: str, top_k: int | None = None) -> AnalyzeResponse:
    claims = split_claims(content)
    if not claims:
        return AnalyzeResponse(findings=[], claims_checked=0, findings_rejected=0, warnings=["No claims found"])
    retrieved = await retrieve_many(claims, top_k)
    n = settings.claims_per_batch
    sem = asyncio.Semaphore(3)

    async def run(i):
        async with sem:
            return await _analyze_batch(claims[i : i + n], retrieved[i : i + n])

    results = await asyncio.gather(*[run(i) for i in range(0, len(claims), n)], return_exceptions=True)
    findings, rejected, warnings = [], 0, []
    seen = set()
    for r in results:
        if isinstance(r, Exception):
            warnings.append(f"A batch failed: {r}")
            continue
        for f in r[0]:
            key = (norm(f.excerpt), norm(f.rule_violated))
            if key not in seen:
                seen.add(key)
                findings.append(f)
        rejected += r[1]
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: (order[f.severity], -f.confidence))
    return AnalyzeResponse(
        findings=findings, claims_checked=len(claims), findings_rejected=rejected, warnings=warnings
    )
