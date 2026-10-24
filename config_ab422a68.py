import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    gemini_api_key = os.getenv("GEMINI_API_KEY", "")
    groq_api_key = os.getenv("GROQ_API_KEY", "")
    groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    embed_model = os.getenv("EMBED_MODEL", "gemini-embedding-001")
    embed_dim = int(os.getenv("EMBED_DIM", "768"))
    chroma_path = os.getenv("CHROMA_PATH", "./chroma_data")
    max_chunk_chars = int(os.getenv("MAX_CHUNK_CHARS", "1200"))
    top_k = int(os.getenv("TOP_K", "4"))
    min_similarity = float(os.getenv("MIN_SIMILARITY", "0.3"))
    claims_per_batch = int(os.getenv("CLAIMS_PER_BATCH", "6"))


settings = Settings()
