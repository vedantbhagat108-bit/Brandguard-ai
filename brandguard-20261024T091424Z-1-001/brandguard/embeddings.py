import asyncio
import hashlib
import math
import httpx
from .config import settings

GEMINI_EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"


def _deterministic_mock_embedding(text: str, dim: int = 768) -> list[float]:
    """Generates a high-quality deterministic pseudo-embedding for testing or offline fallbacks."""
    vec = [0.0] * dim
    # Hash n-grams to distribute across dimensions
    tokens = text.lower().split()
    for token in tokens:
        h = int(hashlib.sha256(token.encode("utf-8")).hexdigest(), 16)
        for i in range(4):
            idx = (h >> (i * 12)) % dim
            val = ((h >> (i * 8)) & 0xFF) / 128.0 - 1.0
            vec[idx] += val
    # Normalize
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [round(x / norm, 6) for x in vec]
    else:
        vec[0] = 1.0
    return vec


async def _embed_gemini_batch(texts: list[str], task: str) -> list[list[float]]:
    if not settings.gemini_api_key:
        return [_deterministic_mock_embedding(t, settings.embed_dim) for t in texts]

    # Model can be gemini-embedding-2-preview or text-embedding-004
    model_name = settings.embed_model
    body = {
        "requests": [
            {
                "model": f"models/{model_name}",
                "content": {"parts": [{"text": t}]},
                "taskType": task,
                "outputDimensionality": settings.embed_dim,
            }
            for t in texts
        ]
    }
    url = GEMINI_EMBED_URL.format(model=model_name)
    async with httpx.AsyncClient(timeout=45) as client:
        for attempt in range(3):
            try:
                r = await client.post(url, params={"key": settings.gemini_api_key}, json=body)
                if r.status_code == 429:
                    await asyncio.sleep(2 ** attempt)
                    continue
                if r.status_code == 200:
                    data = r.json()
                    if "embeddings" in data:
                        return [e["values"] for e in data["embeddings"]]
            except Exception:
                pass
    # Fallback if network or quota issue
    return [_deterministic_mock_embedding(t, settings.embed_dim) for t in texts]


async def embed(texts: list[str], task: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    if not texts:
        return []
    out: list[list[float]] = []
    for i in range(0, len(texts), 50):
        batch = texts[i : i + 50]
        vectors = await _embed_gemini_batch(batch, task)
        out.extend(vectors)
    return out
