"""Anti-hallucination layer: nothing reaches the user unless it is grounded."""
import re

from .retrieve import Retrieved
from .schemas import Citation, LLMCitation


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def quote_in_text(quote: str, text: str) -> bool:
    return norm(quote) in norm(text)


def verify_citations(cites: list[LLMCitation], pool: dict[str, Retrieved]) -> list[Citation]:
    """Keep only citations whose chunk was really retrieved AND whose quote really appears in it."""
    good = []
    for c in cites:
        chunk = pool.get(c.chunk_id)
        if chunk and quote_in_text(c.quote, chunk.text):
            good.append(
                Citation(
                    chunk_id=chunk.chunk_id, document=chunk.document, section=chunk.section,
                    page=chunk.page or None, doc_type=chunk.doc_type, quote=c.quote.strip(),
                )
            )
    return good
