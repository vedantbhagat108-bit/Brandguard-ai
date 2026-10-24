# BrandGuard AI: Two-RAG Enterprise Brand Governance Backend

Production-grade backend implementing the Two-RAG Brand Governance workflow, featuring:
1. **Unsupported-Claim & Knowledge-Gap Detection**: Factual claims with no approved-fact evidence are automatically detected and flagged with high/critical severity, rather than passing silently.
2. **LLM Claim Extraction & Content-Type Classification**: Replaces naive regex sentence splitting. Extracts semantic claims and tags each as `factual`, `tonal`, or `terminology` with risk sensitivity levels.
3. **Hybrid Retrieval**: Dense semantic vector embeddings (768-dim) combined with sparse BM25 lexical token matching and Reciprocal Rank Fusion (RRF). Queries `approved_fact` and `style_rule` separately based on claim classification.
4. **PostgreSQL + pgvector Swap**: Full migration from single-node ChromaDB to scalable PostgreSQL 16 with pgvector HNSW cosine distance indexing and English tsvector full-text search.
5. **Step 8 Review Package Endpoint (`/api/review-package` & `/review-package`)**: Returns comprehensive findings summary, source citations, grounded suggested edits, unsupported claim alerts, knowledge gaps, and audit change history.
6. **Enterprise Security & RBAC**: Role-Based Access Control (`content_creator`, `manager`, `authorised_reviewer`, `admin`, `auditor`), confidentiality clearances (`public`, `internal`, `confidential`, `restricted`), and API authentication.

---

## 1. Directory Structure

```
├── brandguard/                        # Complete Python Backend Implementation
│   ├── __init__.py
│   ├── config.py                     # Configuration, thresholds, model settings
│   ├── schemas.py                    # Enterprise Pydantic domain models & contracts
│   ├── security.py                   # RBAC & confidentiality enforcement
│   ├── db_pgvector.py                # PostgreSQL + pgvector connection & hybrid SQL queries
│   ├── store.py                      # Scalable hybrid vector store (pgvector compatible)
│   ├── embeddings.py                 # Gemini embeddings (gemini-embedding-2-preview)
│   ├── llm.py                        # Gemini structured JSON generator (gemini-3.8-flash)
│   ├── ingest.py                     # Section-aware chunking & document versioning
│   ├── claims.py                     # LLM semantic claim extraction & classification
│   ├── retrieve.py                   # Hybrid retrieval with separate knowledge pools
│   ├── analyze.py                    # Governance engine, unsupported claim & gap detection
│   ├── correct.py                    # Grounded correction engine with verification
│   ├── review_package.py             # Step 8 Review Package generator
│   ├── workflow.py                   # Review & approval workflow state machine
│   ├── analytics.py                  # Insights, repeated mistakes & guideline proposals
│   ├── main.py                       # FastAPI application & route declarations
│   ├── schema.sql                    # PostgreSQL pgvector DDL with HNSW & GIN indexes
│   ├── requirements.txt              # Python dependencies
│   ├── Dockerfile                    # Container definition
│   ├── docker-compose.yml            # PostgreSQL pgvector + API container stack
│   └── test_suite.py                 # Automated test suite
│
├── server.ts                         # Express Full-Stack Server (Port 3000)
├── src/
│   ├── backend/                      # TypeScript Backend Engine
│   │   ├── types.ts
│   │   ├── store.ts
│   │   ├── gemini.ts
│   │   ├── claims.ts
│   │   ├── retrieve.ts
│   │   ├── analyze.ts
│   │   ├── correct.ts
│   │   ├── reviewPackage.ts
│   │   ├── workflow.ts
│   │   ├── analytics.ts
│   │   └── security.ts
│   └── App.tsx                       # Backend Developer Workbench & API Console
```

---

## 2. Key Flaws in Previous Architecture & How They Were Fixed

### A. Unsupported Claims Passed Silently
* **The Flaw**: In the previous implementation, if a factual claim (e.g., "We process 50 million transactions a day certified by NASA") had no matching chunks in RAG 1, the LLM was given an empty pool or irrelevant chunks and returned `findings: []`. Unsubstantiated claims passed silently.
* **The Fix**: During analysis, each claim is classified. For `factual` claims, the system queries the `approved_fact` pool. If no approved fact exceeds the `UNSUPPORTED_CLAIM_THRESHOLD` (0.65), it is flagged as an `unsupported_claim` with `severity: "critical"` or `"high"`, and recorded in `knowledge_gaps` for brand knowledge curators.

### B. Naive Sentence Splitting
* **The Flaw**: `re.split(r"(?<=[.!?])\s+|\n+", text)` broke numbers ("99.95%"), abbreviations ("Dr.", "Inc."), and lacked semantic context.
* **The Fix**: LLM claim extraction with structured JSON output identifies semantic units and classifies each into `factual`, `tonal`, or `terminology`.

### C. ChromaDB Bottleneck Swapped for pgvector
* **The Flaw**: Local ChromaDB was process-locked, could not scale horizontally, and lacked relational audit joins.
* **The Fix**: Replaced with PostgreSQL + pgvector supporting HNSW vector indexes and tsvector full-text search. Includes `schema.sql`, `docker-compose.yml`, and zero-config local hybrid fallback.

### D. Single Indiscriminate Retrieval Pool
* **The Fix**: `retrieve_for_claims` queries `approved_fact` specifically for factual claims, and `style_rule` specifically for tonal/terminology claims.

---

## 3. Core API Endpoints

### `POST /api/review-package`
Generates the complete Step 8 Brand Governance Review Package.
* **Request**:
```json
{
  "title": "Q4 Enterprise Launch Copy",
  "content": "BrandGuard AI is the revolutionary #1 governance platform. We guarantee 100% bug-free uptime. Our database processes 50M transactions daily certified by NASA.",
  "department": "marketing"
}
```
* **Response**:
```json
{
  "package_id": "pkg-...",
  "workflow_status": "pending_manager",
  "summary": {
    "compliance_score": 45.0,
    "publication_recommendation": "BLOCKED_CRITICAL",
    "unsupported_claims_count": 1,
    "knowledge_gaps_count": 1
  },
  "unsupported_claims": [
    {
      "claim_text": "Our database processes 50M transactions daily certified by NASA",
      "reason": "Factual claim has no substantiated approved fact in brand repository",
      "highest_similarity": 0.28
    }
  ],
  "source_links": [...],
  "suggested_edits": [...],
  "change_history": [...]
}
```

### `POST /api/workflow/action`
Handles Creator &rarr; Manager &rarr; Authorised Reviewer transitions.
* **Request**:
```json
{
  "package_id": "pkg-...",
  "action": "approve",
  "actor_id": "manager-1",
  "actor_role": "manager",
  "notes": "Reviewed and escalated"
}
```
