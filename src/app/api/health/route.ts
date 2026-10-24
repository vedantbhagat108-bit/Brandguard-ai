import { NextResponse } from 'next/server';
import { store } from '@/backend/store.ts';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'BrandLens AI - Enterprise Two-RAG Backend Engine',
    version: '1.0.0',
    chunks_indexed: store.count(),
    vector_backend: 'PostgreSQL + pgvector (Scalable Swap)',
    llm_model: 'gemini-3.8-flash',
    embedding_model: 'gemini-embedding-2-preview',
    security_protocols: 'Role-Based Access Control (RBAC), Grounding Verification Gate, Manager Access Rights',
  });
}
