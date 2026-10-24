import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/backend/store.ts';
import { DocType } from '@/backend/types.ts';

export const runtime = 'nodejs';

function chunkText(raw: string, chunkSize = 500): string[] {
  const paragraphs = raw.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 20);
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
    } = body;

    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Brand knowledge text must contain at least 20 characters.' },
        { status: 400 }
      );
    }

    const chunks = chunkText(text.trim()).map((chunkStr, idx) => ({
      chunk_id: `custom-${Date.now().toString(36)}-${idx + 1}`,
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

    // Asynchronously compute dense embeddings for new chunks if API key is configured
    store.ensureSeedEmbeddings().catch((e) => console.warn('Custom chunk embedding warning:', e));

    return NextResponse.json({
      success: true,
      document_name,
      doc_type,
      chunks_ingested: chunks.length,
      total_chunks: store.count(),
    });
  } catch (err: any) {
    console.error('Ingestion failed:', err);
    return NextResponse.json({ error: err.message || 'Ingestion failed' }, { status: 500 });
  }
}
