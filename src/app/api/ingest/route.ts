import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/backend/store.ts';
import { DocType } from '@/backend/types.ts';
import { securityDB } from '@/backend/database.ts';

export const runtime = 'nodejs';

function chunkText(raw: string, chunkSize = 500): string[] {
  const paragraphs = raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 15);
  if (paragraphs.length > 0) return paragraphs;

  const chunks: string[] = [];
  let current = '';
  const lines = raw.split('\n');
  for (const line of lines) {
    if ((current + '\n' + line).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [raw];
}

export async function GET() {
  const documents = store.listDocuments();
  const chunks = store.listChunks().map((c) => ({
    chunk_id: c.chunk_id,
    document_name: c.document_name,
    doc_type: c.doc_type,
    section: c.section,
    page: c.page,
    text: c.text,
    department: c.department,
    version: c.version,
    updated_at: c.updated_at || new Date().toISOString(),
  }));

  return NextResponse.json({
    documents,
    chunks,
    total_chunks: chunks.length,
  });
}

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Malformed or empty JSON request body.' },
        { status: 400 }
      );
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be a JSON object.' },
        { status: 400 }
      );
    }
    const {
      document_name = 'Custom_Brand_Knowledge.md',
      text,
      doc_type = 'style_rule',
      department = 'marketing',
      version = '1.0',
      user_email,
    } = body;

    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Brand knowledge text must contain at least 20 characters.' },
        { status: 400 }
      );
    }

    const chunks = chunkText(text.trim()).map((chunkStr, idx) => ({
      chunk_id: `kb-${Date.now().toString(36)}-${idx + 1}`,
      text: chunkStr,
      section: `Section ${idx + 1}`,
      page: 1,
      metadata: { original_doc: document_name },
    }));

    store.addChunks(
      chunks,
      document_name,
      doc_type as DocType,
      version,
      department,
      'internal'
    );

    securityDB.logAudit({
      brand_id: 'b0000001-0000-4000-8000-000000000001',
      user_id: null,
      user_email: user_email || 'workspace@brandlens.ai',
      action: 'KB_INGESTED',
      details: {
        document_name,
        doc_type,
        chunks_ingested: chunks.length,
        department,
      },
    });

    store
      .ensureSeedEmbeddings()
      .catch((e) => console.warn('Custom chunk embedding warning:', e));

    return NextResponse.json({
      success: true,
      document_name,
      doc_type,
      chunks_ingested: chunks.length,
      total_chunks: store.count(),
      documents: store.listDocuments(),
    });
  } catch (err: any) {
    console.error('Ingestion failed:', err);
    return NextResponse.json(
      { error: err.message || 'Ingestion failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clearAll = searchParams.get('clear_all') === 'true';
  const documentName = searchParams.get('document_name');

  if (clearAll) {
    store.clearAll();
    return NextResponse.json({
      success: true,
      message: 'Cleared all Brand Knowledge documents and chunks.',
      documents: [],
      chunks: [],
      total_chunks: 0,
    });
  }

  if (documentName) {
    const deleted = store.deleteDocument(documentName);
    return NextResponse.json({
      success: true,
      deleted_chunks: deleted,
      document_name: documentName,
      documents: store.listDocuments(),
      total_chunks: store.count(),
    });
  }

  return NextResponse.json(
    { error: 'Specify document_name or clear_all=true' },
    { status: 400 }
  );
}
