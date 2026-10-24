import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Model Configuration (Gemini API via official modern SDK)
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    llm_model: str = os.getenv("LLM_MODEL", "gemini-3.8-flash")
    embed_model: str = os.getenv("EMBED_MODEL", "gemini-embedding-2-preview")
    embed_dim: int = int(os.getenv("EMBED_DIM", "768"))
    
    # Optional alternative LLM provider (Groq / OpenAI compatible)
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_model: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    
    # Database & pgvector Configuration (PostgreSQL + pgvector swap)
    database_url: str = os.getenv("DATABASE_URL", "")
    use_pgvector: bool = os.getenv("USE_PGVECTOR", "true").lower() in ("true", "1", "yes")
    chroma_path: str = os.getenv("CHROMA_PATH", "./data/chroma_data")
    
    # Document Processing & Chunking
    max_chunk_chars: int = int(os.getenv("MAX_CHUNK_CHARS", "1000"))
    chunk_overlap_chars: int = int(os.getenv("CHUNK_OVERLAP_CHARS", "150"))
    
    # Hybrid Retrieval Configuration
    top_k: int = int(os.getenv("TOP_K", "5"))
    min_similarity: float = float(os.getenv("MIN_SIMILARITY", "0.35"))
    sparse_weight: float = float(os.getenv("SPARSE_WEIGHT", "0.3"))
    dense_weight: float = float(os.getenv("DENSE_WEIGHT", "0.7"))
    
    # Unsupported-claim & Knowledge-gap threshold
    # If a factual claim has no approved_fact with similarity >= this threshold, it is flagged!
    unsupported_claim_threshold: float = float(os.getenv("UNSUPPORTED_CLAIM_THRESHOLD", "0.52"))
    claims_per_batch: int = int(os.getenv("CLAIMS_PER_BATCH", "5"))
    
    # Security, RBAC & API Settings
    api_key: str = os.getenv("BRANDGUARD_API_KEY", "bg-enterprise-secret-key-2026")
    jwt_secret: str = os.getenv("JWT_SECRET", "super-secret-brandguard-jwt-key")
    cors_origins: list[str] = ["*"]
    rate_limit_per_minute: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "120"))


settings = Settings()
