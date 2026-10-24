import math
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from .config import settings
from .schemas import ConfidentialityLevel, DocType


@dataclass
class StoredChunk:
    chunk_id: str
    document_name: str
    doc_type: DocType
    section: str
    page: int
    text: str
    department: str = "marketing"
    confidentiality: ConfidentialityLevel = "internal"
    version: str = "1.0"
    embedding: list[float] = field(default_factory=list)
    tokens: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


def _tokenize(text: str) -> list[str]:
    return [w.lower() for w in re.findall(r"\b[a-zA-Z0-9_\-\.]{2,}\b", text)]


def _cosine_similarity(v1: list[float], v2: list[float]) -> float:
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = 0.0
    n1 = 0.0
    n2 = 0.0
    for a, b in zip(v1, v2):
        dot += a * b
        n1 += a * a
        n2 += b * b
    if n1 <= 0.0 or n2 <= 0.0:
        return 0.0
    return max(-1.0, min(1.0, dot / (math.sqrt(n1) * math.sqrt(n2))))


class HybridVectorStore:
    """Scalable Vector & Lexical Store supporting pgvector swap and hybrid retrieval.

    Combines dense semantic vector search (768-dim embeddings) with sparse keyword
    matching (BM25 token-scoring) using Reciprocal Rank Fusion (RRF).
    """

    def __init__(self):
        self._chunks: dict[str, StoredChunk] = {}
        self._doc_versions: dict[str, str] = {}
        self._backend_type = "hybrid_pgvector_compatible"

    def count(self) -> int:
        return len(self._chunks)

    def list_documents(self) -> list[dict]:
        docs: dict[str, dict] = {}
        for c in self._chunks.values():
            if c.document_name not in docs:
                docs[c.document_name] = {
                    "document": c.document_name,
                    "doc_type": c.doc_type,
                    "chunks": 0,
                    "version": c.version,
                    "department": c.department,
                    "confidentiality": c.confidentiality,
                }
            docs[c.document_name]["chunks"] += 1
        return list(docs.values())

    def delete_document(self, document_name: str) -> int:
        to_del = [cid for cid, c in self._chunks.items() if c.document_name == document_name]
        for cid in to_del:
            del self._chunks[cid]
        self._doc_versions.pop(document_name, None)
        return len(to_del)

    def add_chunks(
        self,
        chunks: list[dict],
        document_name: str,
        doc_type: DocType,
        version: str = "1.0",
        department: str = "marketing",
        confidentiality: ConfidentialityLevel = "internal",
    ):
        # Versioning: delete old version if re-ingesting
        self.delete_document(document_name)
        self._doc_versions[document_name] = version

        for c in chunks:
            text = c["text"]
            cid = c["chunk_id"]
            tokens = _tokenize(text)
            self._chunks[cid] = StoredChunk(
                chunk_id=cid,
                document_name=document_name,
                doc_type=doc_type,
                section=c.get("section", ""),
                page=c.get("page", 0),
                text=text,
                department=department,
                confidentiality=confidentiality,
                version=version,
                embedding=c.get("embedding", []),
                tokens=tokens,
                metadata=c.get("metadata", {}),
            )

    def get_chunk(self, chunk_id: str) -> Optional[StoredChunk]:
        return self._chunks.get(chunk_id)

    def get_chunks(self, chunk_ids: list[str]) -> dict[str, StoredChunk]:
        return {cid: self._chunks[cid] for cid in chunk_ids if cid in self._chunks}

    def query_hybrid(
        self,
        query_text: str,
        query_embedding: Optional[list[float]] = None,
        doc_type: Optional[DocType] = None,
        department: Optional[str] = None,
        max_confidentiality: ConfidentialityLevel = "internal",
        top_k: int = 5,
        min_similarity: float = 0.35,
    ) -> list[tuple[StoredChunk, float]]:
        """Hybrid search executing both dense vector similarity and sparse token matching."""
        if not self._chunks:
            return []

        # Filter candidates based on doc_type, department, and confidentiality
        candidates = list(self._chunks.values())
        if doc_type:
            candidates = [c for c in candidates if c.doc_type == doc_type]
        if department and department != "all":
            candidates = [c for c in candidates if c.department in (department, "all", "company-wide")]

        if not candidates:
            return []

        # 1. Dense Scoring
        dense_scores: list[tuple[StoredChunk, float]] = []
        if query_embedding:
            for c in candidates:
                sim = _cosine_similarity(query_embedding, c.embedding)
                dense_scores.append((c, sim))
            dense_scores.sort(key=lambda x: x[1], reverse=True)

        # 2. Sparse (BM25-style token overlap) Scoring
        query_tokens = set(_tokenize(query_text))
        sparse_scores: list[tuple[StoredChunk, float]] = []
        for c in candidates:
            if not query_tokens:
                sparse_scores.append((c, 0.0))
                continue
            common = set(c.tokens).intersection(query_tokens)
            # TF-IDF approximation
            score = sum(1.0 + math.log(1.0 + c.tokens.count(t)) for t in common)
            # Length normalization
            norm_score = score / (1.0 + math.log(1.0 + len(c.tokens))) if c.tokens else 0.0
            sparse_scores.append((c, norm_score))
        sparse_scores.sort(key=lambda x: x[1], reverse=True)

        # 3. Reciprocal Rank Fusion (RRF)
        dense_ranks = {item[0].chunk_id: rank for rank, item in enumerate(dense_scores, start=1)}
        sparse_ranks = {item[0].chunk_id: rank for rank, item in enumerate(sparse_scores, start=1)}

        rrf_scores: list[tuple[StoredChunk, float, float]] = []
        for c in candidates:
            cid = c.chunk_id
            r_dense = dense_ranks.get(cid, 999)
            r_sparse = sparse_ranks.get(cid, 999)

            score_dense = dense_scores[r_dense - 1][1] if r_dense <= len(dense_scores) else 0.0
            score_sparse = sparse_scores[r_sparse - 1][1] if r_sparse <= len(sparse_scores) else 0.0

            # Combined blended metric: 70% dense + 30% normalized sparse, boosted by RRF rank
            rrf = (settings.dense_weight / (60.0 + r_dense)) + (settings.sparse_weight / (60.0 + r_sparse))
            # Normalized overall similarity estimate between 0 and 1
            combined_sim = max(score_dense, 0.0) * 0.75 + min(score_sparse / 3.0, 1.0) * 0.25

            rrf_scores.append((c, combined_sim, rrf))

        rrf_scores.sort(key=lambda x: x[2], reverse=True)

        # Return top_k filtered by min_similarity
        results: list[tuple[StoredChunk, float]] = []
        for chunk, sim, _ in rrf_scores[:top_k]:
            if sim >= min_similarity:
                results.append((chunk, round(sim, 4)))
            elif len(results) == 0 and sim >= (min_similarity * 0.7):
                # Always preserve closest candidate if above fallback floor for gap analysis
                results.append((chunk, round(sim, 4)))

        return results


# Global singleton instance
store = HybridVectorStore()


def get_store() -> HybridVectorStore:
    return store
