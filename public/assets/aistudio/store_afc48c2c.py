import chromadb
from .config import settings

_client = None


def collection():
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=settings.chroma_path)
    return _client.get_or_create_collection("brand_rules", metadata={"hnsw:space": "cosine"})
