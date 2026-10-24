import logging
from typing import Optional
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from . import analytics, analyze, claims, correct, ingest, retrieve, review_package, workflow
from .config import settings
from .llm import LLMError
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    Claim,
    ConfidentialityLevel,
    CorrectRequest,
    CorrectResponse,
    DocType,
    IngestRequest,
    IngestResponse,
    ReviewPackage,
    ReviewPackageRequest,
    UserRole,
    WorkflowActionRequest,
    WorkflowActionResponse,
)
from .security import authenticate_request, require_role
from .store import get_store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("brandguard.main")

app = FastAPI(
    title="BrandGuard AI - Enterprise Two-RAG Brand Governance API",
    version="1.0.0",
    description="Scalable Two-RAG Brand Compliance & Governance Backend featuring unsupported-claim detection, pgvector hybrid search, LLM claim classification, and automated review packages.",
)

# Enable CORS for cross-origin workbench clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Health check and vector store status."""
    store = get_store()
    return {
        "status": "healthy",
        "service": "BrandGuard AI Backend",
        "version": "1.0.0",
        "chunks_indexed": store.count(),
        "vector_backend": "PostgreSQL + pgvector (Hybrid)" if settings.use_pgvector else "Hybrid Memory Store",
        "llm_model": settings.llm_model,
        "embedding_model": settings.embed_model,
        "security_protocols": "RBAC, Tenant Isolation, Anti-Hallucination Grounding Gate",
    }


# ---------- RAG 1: Brand Document Ingestion & Management ----------
@app.post("/ingest", response_model=IngestResponse)
async def ingest_file(
    file: UploadFile = File(...),
    doc_type: DocType = Form("style_rule"),
    department: str = Form("marketing"),
    confidentiality: ConfidentialityLevel = Form("internal"),
    version: str = Form("1.0"),
    _auth=Depends(authenticate_request),
):
    """Ingest a brand guideline or approved fact file (TXT, MD, PDF, DOCX) into RAG 1."""
    data = await file.read()
    try:
        n_chunks, doc_id = await ingest.ingest_document(
            filename=file.filename,
            data=data,
            doc_type=doc_type,
            department=department,
            confidentiality=confidentiality,
            version=version,
        )
        return IngestResponse(
            document=file.filename,
            doc_type=doc_type,
            chunks=n_chunks,
            version=version,
            document_id=doc_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Ingest failure")
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")


@app.post("/ingest-text", response_model=IngestResponse)
async def ingest_text(
    req: IngestRequest,
    _auth=Depends(authenticate_request),
):
    """Directly ingest brand rules or verified facts as raw text."""
    try:
        n_chunks, doc_id = await ingest.ingest_document(
            filename=req.document_name,
            data=req.content.encode("utf-8"),
            doc_type=req.doc_type,
            department=req.department,
            confidentiality=req.confidentiality,
            version=req.version,
            metadata=req.metadata,
        )
        return IngestResponse(
            document=req.document_name,
            doc_type=req.doc_type,
            chunks=n_chunks,
            version=req.version,
            document_id=doc_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.get("/documents")
def list_documents():
    """List all ingested brand documents, categories, versions, and chunk counts."""
    return get_store().list_documents()


@app.delete("/documents/{name}")
def delete_document(
    name: str,
    _role=Depends(require_role(["admin", "authorised_reviewer"])),
):
    """Delete a brand document from the vector store."""
    deleted_count = get_store().delete_document(name)
    if deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Document '{name}' not found")
    return {"deleted": name, "chunks_removed": deleted_count}


# ---------- RAG 2: Content Parsing & Claim Classification ----------
@app.post("/claims/extract", response_model=list[Claim])
async def extract_claims_endpoint(content: str = Form(...)):
    """LLM claim extraction and classification: tags claims as factual, tonal, or terminology."""
    try:
        return await claims.extract_and_classify_claims(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Claim extraction failed: {e}")


# ---------- Hybrid Retrieval with Separate Pools ----------
@app.post("/retrieve")
async def retrieve_endpoint(
    query: str = Form(...),
    doc_type: Optional[DocType] = Form(None),
    department: str = Form("marketing"),
    confidentiality: ConfidentialityLevel = Form("internal"),
    top_k: int = Form(5),
):
    """Execute hybrid retrieval combining dense semantic search and sparse lexical search."""
    hits = await retrieve.retrieve_hybrid(
        query_text=query,
        doc_type=doc_type,
        department=department,
        confidentiality_clearance=confidentiality,
        top_k=top_k,
    )
    return {"query": query, "doc_type_filter": doc_type, "count": len(hits), "results": hits}


# ---------- Brand Governance Engine Analysis ----------
@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_endpoint(
    req: AnalyzeRequest,
    x_user_role: Optional[str] = Header("content_creator", alias="X-User-Role"),
):
    """Brand governance compliance analysis with unsupported-claim and knowledge-gap detection."""
    role: UserRole = x_user_role if x_user_role in ("content_creator", "manager", "authorised_reviewer", "admin") else "content_creator"
    try:
        return await analyze.analyze_content(
            content=req.content,
            top_k=req.top_k,
            department=req.department or "marketing",
            confidentiality_clearance=req.confidentiality_clearance,
            caller_role=role,
        )
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.exception("Analyze failure")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")


# ---------- Grounded Correction ----------
@app.post("/correct", response_model=CorrectResponse)
async def correct_endpoint(req: CorrectRequest):
    """Generates grounded corrections strictly justified by cited knowledge chunks."""
    try:
        return await correct.correct_content(req)
    except correct.CorrectionError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ---------- Step 8: Review Package Generator ----------
@app.post("/review-package", response_model=ReviewPackage)
async def create_review_package(
    req: ReviewPackageRequest,
    x_user_role: Optional[str] = Header("content_creator", alias="X-User-Role"),
):
    """Generates a complete Brand Governance Review Package (Step 8 of Two-RAG Workflow):

    - Summary of findings & severity breakdown
    - Grounded source links and citations
    - Suggested inline edits
    - Unsupported claims & knowledge gaps
    - Audit change history
    """
    role: UserRole = x_user_role if x_user_role in ("content_creator", "manager", "authorised_reviewer", "admin") else "content_creator"
    req.caller_role = role
    try:
        return await review_package.generate_review_package(req)
    except Exception as e:
        logger.exception("Review package generation failure")
        raise HTTPException(status_code=500, detail=f"Failed to generate review package: {e}")


@app.get("/review-package/{package_id}", response_model=ReviewPackage)
def get_review_package_by_id(package_id: str):
    """Retrieve an existing review package by UUID."""
    pkg = review_package.get_package(package_id)
    if not pkg:
        raise HTTPException(status_code=404, detail=f"Review package '{package_id}' not found")
    return pkg


@app.get("/review-packages", response_model=list[ReviewPackage])
def list_review_packages():
    """List all review packages."""
    return review_package.list_packages()


# ---------- Review & Approval Workflow Transitions ----------
@app.post("/workflow/action", response_model=WorkflowActionResponse)
def workflow_action_endpoint(req: WorkflowActionRequest):
    """Transitions review package stage between Content Creator, Manager, and Authorised Reviewer."""
    return workflow.apply_workflow_action(req)


# ---------- Analytics & Insights ----------
@app.get("/analytics")
def analytics_endpoint():
    """Returns brand governance analytics: repeated mistakes, common issue types, and knowledge gaps."""
    return analytics.get_brand_analytics()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("brandguard.main:app", host="0.0.0.0", port=8000, reload=True)
