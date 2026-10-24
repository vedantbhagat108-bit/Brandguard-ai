-- ========================================================================
-- BrandGuard AI: PostgreSQL + pgvector Scalable Database Schema
-- Provides vector embeddings, full-text search, RBAC & review audit logs
-- ========================================================================

-- Enable the pgvector extension for high-performance vector operations
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Table: documents
-- Stores ingested brand documents (guidelines, approved facts, policies)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    doc_type VARCHAR(50) NOT NULL CHECK (doc_type IN ('style_rule', 'approved_fact')),
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    department VARCHAR(100) NOT NULL DEFAULT 'marketing',
    confidentiality VARCHAR(50) NOT NULL DEFAULT 'internal' CHECK (confidentiality IN ('public', 'internal', 'confidential', 'restricted')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'draft')),
    content_hash VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_filename_ver ON documents(filename, version);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type);

-- Table: document_chunks
-- Stores section-aware chunks with both 768-dim embeddings and tsvector for hybrid search
CREATE TABLE IF NOT EXISTS document_chunks (
    id VARCHAR(100) PRIMARY KEY,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    document_name VARCHAR(255) NOT NULL,
    doc_type VARCHAR(50) NOT NULL CHECK (doc_type IN ('style_rule', 'approved_fact')),
    section TEXT NOT NULL DEFAULT '',
    page INT NOT NULL DEFAULT 0,
    chunk_index INT NOT NULL,
    text TEXT NOT NULL,
    department VARCHAR(100) NOT NULL DEFAULT 'marketing',
    confidentiality VARCHAR(50) NOT NULL DEFAULT 'internal' CHECK (confidentiality IN ('public', 'internal', 'confidential', 'restricted')),
    embedding vector(768),
    tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', section || ' ' || text)) STORED,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast HNSW cosine index for 768-dim vector retrieval
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw 
ON document_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- GIN index for sparse full-text lexical search
CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON document_chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_type ON document_chunks(doc_type);
CREATE INDEX IF NOT EXISTS idx_chunks_confidentiality ON document_chunks(confidentiality);

-- Table: review_packages
-- Stores generated brand governance packages, findings, suggested edits, and audit logs
CREATE TABLE IF NOT EXISTS review_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    content_raw TEXT NOT NULL,
    creator_id VARCHAR(100) NOT NULL,
    workflow_status VARCHAR(50) NOT NULL DEFAULT 'pending_manager' 
        CHECK (workflow_status IN ('draft', 'pending_manager', 'pending_reviewer', 'approved', 'rejected', 'escalated')),
    compliance_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    publication_recommendation VARCHAR(50) NOT NULL DEFAULT 'NEEDS_REVISION',
    package_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_packages_status ON review_packages(workflow_status);
CREATE INDEX IF NOT EXISTS idx_review_packages_creator ON review_packages(creator_id);

-- Table: audit_log
-- Enterprise audit trail for compliance verification & accountability
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    actor_id VARCHAR(100) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    notes TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
