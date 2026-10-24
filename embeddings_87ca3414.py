import asyncio
import httpx
from .config import settings

URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"


async def _embed_batch(texts: list[str], task: str) -> list[list[float]]:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY not set")
    body = {
        "requests": [
            {
                "model": f"models/{settings.embed_model}",
                "content": {"parts": [{"text": t}]},
                "taskType": task,
                "outputDimensionality": settings.embed_dim,
            }
            for t in texts
        ]
    }
    url = URL.format(model=settings.embed_model)
    async with httpx.AsyncClient(timeout=60) as client:
        for attempt in range(4):
            r = await client.post(url, params={"key": settings.gemini_api_key}, json=body)
            if r.status_code == 429:
                await asyncio.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            return [e["values"] for e in r.json()["embeddings"]]
    raise RuntimeError("Gemini embeddings rate-limited")


async def embed(texts: list[str], task: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    out: list[list[float]] = []
    for i in range(0, len(texts), 100):  # API limit: 100 per batch
        out.extend(await _embed_batch(texts[i : i + 100], task))
    return out
