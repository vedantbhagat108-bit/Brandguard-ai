import json
import logging
from typing import Any, Optional
from .config import settings
from .schemas import Citation, ConfidentialityLevel, DocType

logger = logging.getLogger("brandguard.db_pgvector")

# Standard pgvector SQL queries
CREATE_EXTENSION_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
"""

HYBRID_SEARCH_PGVECTOR_SQL = """
WITH dense_search AS (
    SELECT 
        id, 
        document_name, 
        section, 
        page, 
        doc_type, 
        text, 
        department, 
        confidentiality,
        1 - (embedding <=> $1::vector) AS dense_sim,
        ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector ASC) as dense_rank
    FROM document_chunks
    WHERE ($3::text IS NULL OR doc_type = $3)
      AND ($4::text IS NULL OR department = $4)
    ORDER BY embedding <=> $1::vector ASC
    LIMIT 25
),
sparse_search AS (
    SELECT 
        id, 
        document_name, 
        section, 
        page, 
        doc_type, 
        text, 
        department, 
        confidentiality,
        ts_rank_cd(tsv, plainto_tsquery('english', $2)) AS sparse_score,
        ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, plainto_tsquery('english', $2)) DESC) as sparse_rank
    FROM document_chunks
    WHERE tsv @@ plainto_tsquery('english', $2)
      AND ($3::text IS NULL OR doc_type = $3)
      AND ($4::text IS NULL OR department = $4)
    ORDER BY sparse_score DESC
    LIMIT 25
)
SELECT 
    COALESCE(d.id, s.id) AS chunk_id,
    COALESCE(d.document_name, s.document_name) AS document_name,
    COALESCE(d.section, s.section) AS section,
    COALESCE(d.page, s.page) AS page,
    COALESCE(d.doc_type, s.doc_type) AS doc_type,
    COALESCE(d.text, s.text) AS text,
    COALESCE(d.dense_sim, 0.0) AS dense_sim,
    COALESCE(s.sparse_score, 0.0) AS sparse_score,
    (
        COALESCE(0.7 / (60 + d.dense_rank), 0.0) +
        COALESCE(0.3 / (60 + s.sparse_rank), 0.0)
    ) AS rrf_score
FROM dense_search d
FULL OUTER JOIN sparse_search s ON d.id = s.id
ORDER BY rrf_score DESC
LIMIT $5;
"""


class PgVectorConnection:
    """PostgreSQL + pgvector connection manager for high-scale enterprise deployments."""

    def __init__(self, database_url: str):
        self.database_url = database_url
        self._pool = None

    async def connect(self):
        if not self.database_url:
            return False
        try:
            import asyncpg
            self._pool = await asyncpg.create_pool(
                dsn=self.database_url,
                min_size=2,
                max_size=10,
                timeout=15,
            )
            logger.info("Successfully connected to PostgreSQL database with pgvector")
            return True
        except Exception as e:
            logger.warning(f"PostgreSQL connection failed ({e}). Falling back to local hybrid vector engine.")
            self._pool = None
            return False

    async def close(self):
        if self._pool:
            await self._pool.close()
            self._pool = None

    @property
    def is_connected(self) -> bool:
        return self._pool is not None
