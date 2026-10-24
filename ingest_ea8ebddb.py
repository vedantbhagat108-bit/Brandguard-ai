import io
import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from . import embeddings
from .config import settings
from .store import collection

HEADING_RE = re.compile(r"^(#{1,6}\s+\S|\d+(\.\d+)*[.)]?\s+[A-Z]\S)")


@dataclass
class Block:
    text: str
    page: int
    is_heading: bool = False


def _looks_like_heading(line: str) -> bool:
    s = line.strip()
    if not s or len(s) > 80 or s.endswith((".", ",", ";")):
        return False
    return bool(HEADING_RE.match(s)) or (s.isupper() and len(s) > 3)


def _blocks_from_text(text: str, page: int) -> list[Block]:
    blocks, para = [], []

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


def parse(filename: str, data: bytes) -> list[Block]:
    ext = Path(filename).suffix.lower()
    if ext in (".txt", ".md"):
        return _blocks_from_text(data.decode("utf-8", errors="ignore"), 0)
    if ext == ".pdf":
        from pypdf import PdfReader

        blocks = []
        for i, page in enumerate(PdfReader(io.BytesIO(data)).pages, start=1):
            blocks += _blocks_from_text(page.extract_text() or "", i)
        return blocks
    if ext == ".docx":
        from docx import Document

        blocks = []
        for p in Document(io.BytesIO(data)).paragraphs:
            if not p.text.strip():
                continue
            is_h = p.style.name.lower().startswith(("heading", "title"))
            blocks.append(Block(p.text.strip(), 0, is_h))
        return blocks
    raise ValueError(f"Unsupported file type: {ext} (use pdf, docx, txt, md)")


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
    """Section-aware chunking: a chunk never crosses a heading, so rules like
    'never say X unless Y' stay together."""
    chunks: list[dict] = []
    state = {"heading": "", "buf": [], "len": 0, "page": 0}

    def flush():
        if state["buf"]:
            body = "\n".join(state["buf"])
            text = f"{state['heading']}\n{body}" if state["heading"] else body
            chunks.append({"text": text, "section": state["heading"], "page": state["page"]})
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


async def ingest_document(filename: str, data: bytes, doc_type: str) -> int:
    chunks = chunk_blocks(parse(filename, data), settings.max_chunk_chars)
    if not chunks:
        raise ValueError("No text could be extracted from the document")
    col = collection()
    col.delete(where={"document": filename})  # re-ingest replaces old version
    vectors = await embeddings.embed([c["text"] for c in chunks], "RETRIEVAL_DOCUMENT")
    uid = uuid.uuid4().hex[:6]
    col.add(
        ids=[f"{uid}-{i}" for i in range(len(chunks))],
        documents=[c["text"] for c in chunks],
        embeddings=vectors,
        metadatas=[
            {"document": filename, "section": c["section"], "page": c["page"], "doc_type": doc_type}
            for c in chunks
        ],
    )
    return len(chunks)
