import hashlib
import io
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from . import embeddings
from .config import settings
from .schemas import ConfidentialityLevel, DocType
from .store import get_store

HEADING_RE = re.compile(r"^(#{1,6}\s+\S|\d+(\.\d+)*[.)]?\s+[A-Z]\S)")


@dataclass
class Block:
    text: str
    page: int
    is_heading: bool = False


def _looks_like_heading(line: str) -> bool:
    s = line.strip()
    if not s or len(s) > 90 or s.endswith((".", ";")):
        return False
    return bool(HEADING_RE.match(s)) or (s.isupper() and len(s) > 3)


def _blocks_from_text(text: str, page: int = 1) -> list[Block]:
    blocks: list[Block] = []
    para: list[str] = []

    def flush():
        if para:
            blocks.append(Block(" ".join(para), page))
            para.clear()

    for line in text.splitlines():
        if not line.strip():
            flush()
        elif _looks_like_heading(line):
            flush()
            blocks.append(Block(line.strip(), page, True))
        else:
            para.append(line.strip())
    flush()
    return blocks


def parse_document(filename: str, data: bytes) -> list[Block]:
    """Extracts text blocks with headings from TXT, MD, PDF, or DOCX."""
    ext = Path(filename).suffix.lower()
    if ext in (".txt", ".md", ""):
        return _blocks_from_text(data.decode("utf-8", errors="ignore"), 1)
    if ext == ".pdf":
        try:
            from pypdf import PdfReader
            blocks = []
            for i, page in enumerate(PdfReader(io.BytesIO(data)).pages, start=1):
                blocks += _blocks_from_text(page.extract_text() or "", i)
            return blocks
        except Exception:
            return _blocks_from_text(data.decode("utf-8", errors="ignore"), 1)
    if ext == ".docx":
        try:
            from docx import Document
            blocks = []
            for p in Document(io.BytesIO(data)).paragraphs:
                if not p.text.strip():
                    continue
                is_h = p.style.name.lower().startswith(("heading", "title"))
                blocks.append(Block(p.text.strip(), 1, is_h))
            return blocks
        except Exception:
            return _blocks_from_text(data.decode("utf-8", errors="ignore"), 1)
    return _blocks_from_text(data.decode("utf-8", errors="ignore"), 1)


def _split_long(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    parts, cur = [], ""
    for sent in re.split(r"(?<=[.!?])\s+", text):
        if cur and len(cur) + len(sent) > max_chars:
            parts.append(cur)
            cur = ""
        cur = f"{cur} {sent}".strip()
    if cur:
        parts.append(cur)
    return parts


def chunk_blocks(blocks: list[Block], max_chars: int) -> list[dict]:
    """Section-aware chunking: chunks preserve parent headings and do not cross heading boundaries."""
    chunks: list[dict] = []
    state = {"heading": "", "buf": [], "len": 0, "page": 1}

    def flush():
        if state["buf"]:
            body = "\n".join(state["buf"])
            text = f"{state['heading']}\n{body}" if state["heading"] else body
            chunks.append({
                "text": text,
                "section": state["heading"],
                "page": state["page"],
            })
        state["buf"], state["len"] = [], 0

    for b in blocks:
        if b.is_heading:
            flush()
            state["heading"] = b.text.lstrip("# ").strip()
            continue
        for piece in _split_long(b.text, max_chars):
            if state["len"] + len(piece) > max_chars:
                flush()
            if not state["buf"]:
                state["page"] = b.page
            state["buf"].append(piece)
            state["len"] += len(piece)
    flush()
    return chunks


async def ingest_document(
    filename: str,
    data: bytes,
    doc_type: DocType,
    department: str = "marketing",
    confidentiality: ConfidentialityLevel = "internal",
    version: str = "1.0",
    metadata: Optional[dict[str, Any]] = None,
) -> tuple[int, str]:
    """Ingests, chunks, computes embeddings, and indexes brand documents in the vector store."""
    blocks = parse_document(filename, data)
    raw_chunks = chunk_blocks(blocks, settings.max_chunk_chars)
    if not raw_chunks:
        raise ValueError("No readable text could be extracted from document.")

    doc_id = str(uuid.uuid4())
    texts = [c["text"] for c in raw_chunks]
    vectors = await embeddings.embed(texts, "RETRIEVAL_DOCUMENT")

    prepared_chunks = []
    for idx, (c, vec) in enumerate(zip(raw_chunks, vectors)):
        cid = f"{filename[:20]}-p{c['page']}-c{idx}"
        prepared_chunks.append({
            "chunk_id": cid,
            "text": c["text"],
            "section": c["section"],
            "page": c["page"],
            "embedding": vec,
            "metadata": metadata or {},
        })

    store = get_store()
    store.add_chunks(
        chunks=prepared_chunks,
        document_name=filename,
        doc_type=doc_type,
        version=version,
        department=department,
        confidentiality=confidentiality,
    )

    return len(prepared_chunks), doc_id
