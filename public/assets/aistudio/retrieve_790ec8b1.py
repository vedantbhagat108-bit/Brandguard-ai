from pydantic import BaseModel

from . import embeddings
from .config import settings
from .store import collection


class Retrieved(BaseModel):
    chunk_id: str
    text: str
    document: str
    section: str
    page: int
    doc_type: str
    similarity: float


def _to_retrieved(cid, doc, meta, sim) -> Retrieved:
    return Retrieved(
        chunk_id=cid, text=doc, document=meta["document"], section=meta.get("section", ""),
        page=meta.get("page", 0), doc_type=meta["doc_type"], similarity=sim,
    )


async def retrieve_many(queries: list[str], k: int | None = None) -> list[list[Retrieved]]:
    col = collection()
    if col.count() == 0:
        return [[] for _ in queries]
    k = k or settings.top_k
    vecs = await embeddings.embed(queries, "RETRIEVAL_QUERY")
    res = col.query(query_embeddings=vecs, n_results=min(k, col.count()))
    out = []
    for ids, docs, metas, dists in zip(res["ids"], res["documents"], res["metadatas"], res["distances"]):
        hits = [_to_retrieved(i, d, m, round(1 - dist, 4)) for i, d, m, dist in zip(ids, docs, metas, dists)]
        out.append([h for h in hits if h.similarity >= settings.min_similarity])
    return out


def get_chunks(ids: list[str]) -> dict[str, Retrieved]:
    res = collection().get(ids=ids)
    return {
        i: _to_retrieved(i, d, m, 1.0)
        for i, d, m in zip(res["ids"], res["documents"], res["metadatas"])
    }
