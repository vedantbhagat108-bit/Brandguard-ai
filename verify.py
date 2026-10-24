import re
from typing import Optional
from .retrieve import Retrieved
from .schemas import Citation, LLMCitation


def norm(s: str) -> str:
    """Normalizes string for robust quote matching across whitespace and punctuation."""
    if not s:
        return ""
    # Strip redundant spaces and lower
    return re.sub(r"\s+", " ", s).strip().lower()


def quote_in_text(quote: str, text: str) -> bool:
    """Checks whether normalized quote appears verbatim within normalized text."""
    if not quote or not text:
        return False
    # Check direct substring
    if norm(quote) in norm(text):
        return True
    # Check stripped punctuation substring
    clean_q = re.sub(r"[^\w\s]", "", norm(quote))
    clean_t = re.sub(r"[^\w\s]", "", norm(text))
    return len(clean_q) >= 4 and clean_q in clean_t


def verify_citations(cites: list[LLMCitation], pool: dict[str, Retrieved]) -> list[Citation]:
    """Strict grounding gate: only allows citations whose chunk exists in retrieved pool

    AND whose quote is truly present in that chunk.
    """
    good: list[Citation] = []
    seen = set()
    for c in cites:
        chunk = pool.get(c.chunk_id)
        if chunk and quote_in_text(c.quote, chunk.text):
            key = (chunk.chunk_id, norm(c.quote))
            if key not in seen:
                seen.add(key)
                good.append(
                    Citation(
                        chunk_id=chunk.chunk_id,
                        document=chunk.document,
                        section=chunk.section or "",
                        page=chunk.page or None,
                        doc_type=chunk.doc_type,
                        quote=c.quote.strip(),
                        similarity=round(chunk.similarity, 4),
                    )
                )
    return good
