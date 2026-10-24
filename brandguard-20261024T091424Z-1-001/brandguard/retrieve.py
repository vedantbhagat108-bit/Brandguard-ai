from typing import Optional
from pydantic import BaseModel

from . import embeddings
from .config import settings
from .schemas import Claim, ConfidentialityLevel, DocType
from .store import StoredChunk, get_store


class Retrieved(BaseModel):
    chunk_id: str
    text: str
    document: str
    section: str
    page: int
    doc_type: DocType
    department: str = "marketing"
    confidentiality: ConfidentialityLevel = "internal"
    similarity: float


def _stored_to_retrieved(chunk: StoredChunk, similarity: float) -> Retrieved:
    return Retrieved(
        chunk_id=chunk.chunk_id,
        text=chunk.text,
        document=chunk.document_name,
        section=chunk.section or "",
        page=chunk.page or 0,
        doc_type=chunk.doc_type,
        department=chunk.department,
        confidentiality=chunk.confidentiality,
        similarity=similarity,
    )


async def retrieve_hybrid(
    query_text: str,
    doc_type: Optional[DocType] = None,
    department: Optional[str] = None,
    confidentiality_clearance: ConfidentialityLevel = "internal",
    top_k: Optional[int] = None,
) -> list[Retrieved]:
    """Performs hybrid retrieval (vector similarity + keyword search) with metadata filtering."""
    store = get_store()
    if store.count() == 0:
        return []

    k = top_k or settings.top_k
    vecs = await embeddings.embed([query_text], "RETRIEVAL_QUERY")
    query_vec = vecs[0] if vecs else None

    results = store.query_hybrid(
        query_text=query_text,
        query_embedding=query_vec,
        doc_type=doc_type,
        department=department,
        max_confidentiality=confidentiality_clearance,
        top_k=k,
        min_similarity=settings.min_similarity,
    )

    return [_stored_to_retrieved(chunk, sim) for chunk, sim in results]


async def retrieve_for_claims(
    claims: list[Claim],
    department: Optional[str] = None,
    confidentiality_clearance: ConfidentialityLevel = "internal",
    top_k: Optional[int] = None,
) -> dict[str, list[Retrieved]]:
    """Separately queries approved facts and style rules based on each claim's classified type."""
    store = get_store()
    if store.count() == 0:
        return {c.claim_id: [] for c in claims}

    # Batch compute embeddings for all claims
    claim_texts = [c.text for c in claims]
    vecs = await embeddings.embed(claim_texts, "RETRIEVAL_QUERY")

    retrieved_by_claim: dict[str, list[Retrieved]] = {}
    k = top_k or settings.top_k

    for i, claim in enumerate(claims):
        q_vec = vecs[i] if i < len(vecs) else None
        hits: list[Retrieved] = []

        if claim.claim_type == "factual":
            # Query approved facts specifically
            fact_results = store.query_hybrid(
                query_text=claim.text,
                query_embedding=q_vec,
                doc_type="approved_fact",
                department=department,
                max_confidentiality=confidentiality_clearance,
                top_k=k,
                min_similarity=settings.min_similarity,
            )
            hits.extend([_stored_to_retrieved(chunk, sim) for chunk, sim in fact_results])

            # If legal or high risk, also check style rules for prohibited wording
            if claim.sensitivity_level in ("high_risk", "legal_sensitive"):
                rule_results = store.query_hybrid(
                    query_text=claim.text,
                    query_embedding=q_vec,
                    doc_type="style_rule",
                    department=department,
                    max_confidentiality=confidentiality_clearance,
                    top_k=max(2, k // 2),
                    min_similarity=settings.min_similarity,
                )
                hits.extend([_stored_to_retrieved(chunk, sim) for chunk, sim in rule_results])

        elif claim.claim_type in ("tonal", "terminology"):
            # Query style rules specifically
            rule_results = store.query_hybrid(
                query_text=claim.text,
                query_embedding=q_vec,
                doc_type="style_rule",
                department=department,
                max_confidentiality=confidentiality_clearance,
                top_k=k,
                min_similarity=settings.min_similarity,
            )
            hits.extend([_stored_to_retrieved(chunk, sim) for chunk, sim in rule_results])

        # Deduplicate hits by chunk_id
        seen = set()
        unique_hits = []
        for h in hits:
            if h.chunk_id not in seen:
                seen.add(h.chunk_id)
                unique_hits.append(h)

        retrieved_by_claim[claim.claim_id] = unique_hits

    return retrieved_by_claim


def get_chunks(ids: list[str]) -> dict[str, Retrieved]:
    """Direct lookup of chunks by ID for grounding verification."""
    store = get_store()
    raw = store.get_chunks(ids)
    return {cid: _stored_to_retrieved(sc, 1.0) for cid, sc in raw.items()}
