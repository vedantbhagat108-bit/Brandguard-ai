from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from . import analyze, correct, ingest
from .llm import LLMError
from .schemas import AnalyzeRequest, AnalyzeResponse, CorrectRequest, CorrectResponse, DocType, IngestResponse
from .store import collection

app = FastAPI(title="BrandGuard AI", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "chunks_indexed": collection().count()}


@app.post("/ingest", response_model=IngestResponse)
async def ingest_doc(file: UploadFile = File(...), doc_type: DocType = Form("style_rule")):
    data = await file.read()
    try:
        n = await ingest.ingest_document(file.filename, data, doc_type)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return IngestResponse(document=file.filename, doc_type=doc_type, chunks=n)


@app.get("/documents")
def list_documents():
    metas = collection().get()["metadatas"]
    docs: dict[str, dict] = {}
    for m in metas:
        d = docs.setdefault(m["document"], {"document": m["document"], "doc_type": m["doc_type"], "chunks": 0})
        d["chunks"] += 1
    return list(docs.values())


@app.delete("/documents/{name}")
def delete_document(name: str):
    collection().delete(where={"document": name})
    return {"deleted": name}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_endpoint(req: AnalyzeRequest):
    try:
        return await analyze.analyze_content(req.content, req.top_k)
    except LLMError as e:
        raise HTTPException(502, str(e))


@app.post("/correct", response_model=CorrectResponse)
async def correct_endpoint(req: CorrectRequest):
    try:
        return await correct.correct(req)
    except correct.CorrectionError as e:
        raise HTTPException(422, str(e))
    except LLMError as e:
        raise HTTPException(502, str(e))
