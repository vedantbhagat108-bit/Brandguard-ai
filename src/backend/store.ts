import { ConfidentialityLevel, DocType, StoredDocument } from './types.ts';
import { generateDeterministicEmbedding } from './gemini.ts';

export interface StoredChunk {
  chunk_id: string;
  document_name: string;
  doc_type: DocType;
  section: string;
  page: number;
  text: string;
  department: string;
  confidentiality: ConfidentialityLevel;
  version: string;
  embedding: number[];
  tokens: string[];
  metadata: Record<string, any>;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/\b[a-z0-9_\-\.]{2,}\b/g) || []);
}

function cosineSimilarity(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dot = 0;
  let n1 = 0;
  let n2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    n1 += v1[i] * v1[i];
    n2 += v2[i] * v2[i];
  }
  if (n1 <= 0 || n2 <= 0) return 0;
  return Math.max(-1, Math.min(1, dot / (Math.sqrt(n1) * Math.sqrt(n2))));
}

export class HybridVectorStore {
  private chunks: Map<string, StoredChunk> = new Map();
  private docVersions: Map<string, string> = new Map();

  constructor() {
    this.seedDefaultKnowledgeBase();
  }

  public count(): number {
    return this.chunks.size;
  }

  public listDocuments(): StoredDocument[] {
    const docs = new Map<string, StoredDocument>();
    for (const c of this.chunks.values()) {
      if (!docs.has(c.document_name)) {
        docs.set(c.document_name, {
          document: c.document_name,
          doc_type: c.doc_type,
          chunks: 0,
          version: c.version,
          department: c.department,
          confidentiality: c.confidentiality,
          updated_at: new Date().toISOString(),
        });
      }
      docs.get(c.document_name)!.chunks += 1;
    }
    return Array.from(docs.values());
  }

  public deleteDocument(documentName: string): number {
    let deleted = 0;
    for (const [cid, chunk] of this.chunks.entries()) {
      if (chunk.document_name === documentName) {
        this.chunks.delete(cid);
        deleted += 1;
      }
    }
    this.docVersions.delete(documentName);
    return deleted;
  }

  public addChunks(
    chunks: Array<{
      chunk_id: string;
      text: string;
      section?: string;
      page?: number;
      embedding?: number[];
      metadata?: Record<string, any>;
    }>,
    documentName: string,
    docType: DocType,
    version: string = '1.0',
    department: string = 'marketing',
    confidentiality: ConfidentialityLevel = 'internal',
  ) {
    this.deleteDocument(documentName);
    this.docVersions.set(documentName, version);

    for (const c of chunks) {
      const text = c.text;
      const emb = c.embedding && c.embedding.length > 0 ? c.embedding : generateDeterministicEmbedding(text);
      this.chunks.set(c.chunk_id, {
        chunk_id: c.chunk_id,
        document_name: documentName,
        doc_type: docType,
        section: c.section || '',
        page: c.page || 1,
        text: text,
        department: department,
        confidentiality: confidentiality,
        version: version,
        embedding: emb,
        tokens: tokenize(text),
        metadata: c.metadata || {},
      });
    }
  }

  public getChunk(chunkId: string): StoredChunk | undefined {
    return this.chunks.get(chunkId);
  }

  public getChunks(chunkIds: string[]): Record<string, StoredChunk> {
    const res: Record<string, StoredChunk> = {};
    for (const id of chunkIds) {
      const c = this.chunks.get(id);
      if (c) res[id] = c;
    }
    return res;
  }

  public queryHybrid(params: {
    queryText: string;
    queryEmbedding?: number[];
    docType?: DocType;
    department?: string;
    maxConfidentiality?: ConfidentialityLevel;
    topK?: number;
    minSimilarity?: number;
  }): Array<{ chunk: StoredChunk; similarity: number }> {
    const {
      queryText,
      queryEmbedding,
      docType,
      department,
      topK = 5,
      minSimilarity = 0.35,
    } = params;

    let candidates = Array.from(this.chunks.values());
    if (docType) {
      candidates = candidates.filter((c) => c.doc_type === docType);
    }
    if (department && department !== 'all') {
      candidates = candidates.filter((c) => c.department === department || c.department === 'all');
    }

    if (candidates.length === 0) return [];

    const qTokens = new Set(tokenize(queryText));
    const emb = queryEmbedding || generateDeterministicEmbedding(queryText);

    // 1. Dense Scoring
    const denseScores = candidates.map((c) => ({
      chunk: c,
      sim: cosineSimilarity(emb, c.embedding),
    }));
    denseScores.sort((a, b) => b.sim - a.sim);

    // 2. Sparse (BM25-style token overlap)
    const sparseScores = candidates.map((c) => {
      let score = 0;
      for (const t of qTokens) {
        if (c.tokens.includes(t)) {
          score += 1.0;
        }
      }
      const normScore = score / (1.0 + Math.log(1.0 + c.tokens.length));
      return { chunk: c, score: normScore };
    });
    sparseScores.sort((a, b) => b.score - a.score);

    const denseRanks = new Map<string, number>();
    denseScores.forEach((item, idx) => denseRanks.set(item.chunk.chunk_id, idx + 1));

    const sparseRanks = new Map<string, number>();
    sparseScores.forEach((item, idx) => sparseRanks.set(item.chunk.chunk_id, idx + 1));

    // 3. Reciprocal Rank Fusion (RRF)
    const fused = candidates.map((c) => {
      const cid = c.chunk_id;
      const rDense = denseRanks.get(cid) || 999;
      const rSparse = sparseRanks.get(cid) || 999;

      const denseItem = denseScores.find((x) => x.chunk.chunk_id === cid);
      const sparseItem = sparseScores.find((x) => x.chunk.chunk_id === cid);

      const simDense = Math.max(0, denseItem ? denseItem.sim : 0);
      const scoreSparse = sparseItem ? sparseItem.score : 0;
      const rrf = 0.7 / (60 + rDense) + 0.3 / (60 + rSparse);

      // Balanced hybrid score: 50% dense semantic + 50% sparse keyword matching
      const combinedSim = Number(
        (Math.max(simDense, 0) * 0.5 + Math.min(scoreSparse, 1.0) * 0.5).toFixed(4)
      );

      return { chunk: c, similarity: combinedSim, rrf };
    });

    fused.sort((a, b) => b.rrf - a.rrf);

    const results: Array<{ chunk: StoredChunk; similarity: number }> = [];
    for (const item of fused.slice(0, topK)) {
      if (item.similarity >= minSimilarity) {
        results.push({ chunk: item.chunk, similarity: item.similarity });
      } else if (results.length === 0 && item.similarity >= 0.20) {
        results.push({ chunk: item.chunk, similarity: item.similarity });
      }
    }

    return results;
  }

  public async ensureSeedEmbeddings() {
    try {
      const { getEmbeddings, hasValidGeminiKey } = await import('./gemini.ts');
      if (hasValidGeminiKey) {
        const chunkList = Array.from(this.chunks.values());
        const texts = chunkList.map((c) => c.text);
        const embeddings = await getEmbeddings(texts);
        chunkList.forEach((c, idx) => {
          if (embeddings[idx] && embeddings[idx].length > 0) {
            c.embedding = embeddings[idx];
          }
        });
      }
    } catch {
      // Fallback preserved
    }
  }

  private seedDefaultKnowledgeBase() {
    // Seed Style Rules
    const styleChunks = [
      {
        chunk_id: 'style-tone-01',
        text: 'Tone of Voice: Our voice is confident, humble, helpful, and direct. Never use hyperbole, aggressive superlative words like "unbeatable", "revolutionary", or "#1". Avoid puffery.',
        section: 'Tone & Voice Guidelines',
        page: 1,
      },
      {
        chunk_id: 'style-naming-02',
        text: 'Product Naming: Always write and capitalize "BrandGuard AI". Never refer to BrandGuard as "the script", "the bot", or uncapitalized "brandguard".',
        section: 'Brand Identity & Terminology',
        page: 1,
      },
      {
        chunk_id: 'style-legal-03',
        text: 'Legal & Guarantees: Never make absolute claims or zero-defect promises such as "100% bug-free", "unbreakable security", or "never fails". All service guarantees must reference SLA contracts.',
        section: 'Legal & Risk Guidelines',
        page: 2,
      },
      {
        chunk_id: 'style-jargon-04',
        text: 'Terminology: Avoid outdated corporate buzzwords such as "synergize", "game-changing paradigm", or "next-gen disruptor". Speak plainly about technical functionality.',
        section: 'Editorial Vocabulary',
        page: 2,
      },
    ];

    this.addChunks(
      styleChunks,
      'Enterprise_Brand_Style_Guide_2026.md',
      'style_rule',
      '2.4',
      'marketing',
      'internal',
    );

    // Seed Approved Facts
    const factChunks = [
      {
        chunk_id: 'fact-sla-01',
        text: 'BrandGuard AI contracts guarantee an SLA uptime of 99.95% backed by financial credit remedies for enterprise subscribers.',
        section: 'Service Level Agreement',
        page: 1,
      },
      {
        chunk_id: 'fact-security-02',
        text: 'Compliance Certifications: BrandGuard AI is SOC2 Type II certified, ISO 27001 compliant, and GDPR compliant with data residency in US and EU regions.',
        section: 'Security & Certifications',
        page: 1,
      },
      {
        chunk_id: 'fact-scale-03',
        text: 'Active Deployment Metric: As of Q3 2026, BrandGuard AI protects over 1,200 enterprise organizations across 45 countries.',
        section: 'Corporate Milestones',
        page: 2,
      },
      {
        chunk_id: 'fact-latency-04',
        text: 'Performance Benchmark: Vector hybrid retrieval achieves p99 response latency under 45ms for enterprise document sets up to 2 million chunks.',
        section: 'Architecture Benchmarks',
        page: 2,
      },
    ];

    this.addChunks(
      factChunks,
      'Approved_Enterprise_Facts_2026.md',
      'approved_fact',
      '3.1',
      'marketing',
      'internal',
    );
  }
}

const globalForVectorStore = globalThis as unknown as {
  hybridVectorStore?: HybridVectorStore;
};

if (!globalForVectorStore.hybridVectorStore) {
  globalForVectorStore.hybridVectorStore = new HybridVectorStore();
}

export const store = globalForVectorStore.hybridVectorStore;
