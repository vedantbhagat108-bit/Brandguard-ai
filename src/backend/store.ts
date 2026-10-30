import fs from 'fs';
import path from 'path';
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
  updated_at?: string;
}

const LEGACY_DEMO_DOCS = new Set([
  'Enterprise_Brand_Style_Guide_2026.md',
  'Approved_Enterprise_Facts_2026.md',
  'EcoFresh_Botanicals_Compliance_Policy.md',
  'Product_Facts_and_Clinical_Claims_2026.md',
  'Sales_and_Enterprise_SLA_Facts.md',
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z0-9_\-\.]{2,}\b/g) || [];
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
  private initialized = false;

  constructor() {
    this.loadFromDisk();
  }

  private getStorageFilePath(): string {
    try {
      const localDir = path.join(process.cwd(), '.data');
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      fs.accessSync(localDir, fs.constants.W_OK);
      return path.join(localDir, 'knowledge-store.json');
    } catch {
      return '/tmp/brandlens-knowledge-store.json';
    }
  }

  public loadFromDisk(): void {
    try {
      const filePath = this.getStorageFilePath();
      if (!fs.existsSync(filePath)) {
        this.initialized = true;
        return;
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.chunks)) {
        this.chunks.clear();
        for (const [id, chunk] of parsed.chunks) {
          if (id && chunk && chunk.document_name && !LEGACY_DEMO_DOCS.has(chunk.document_name)) {
            this.chunks.set(id, chunk as StoredChunk);
          }
        }
      }
      if (Array.isArray(parsed.docVersions)) {
        this.docVersions.clear();
        for (const [doc, ver] of parsed.docVersions) {
          if (doc && !LEGACY_DEMO_DOCS.has(doc)) {
            this.docVersions.set(doc, String(ver));
          }
        }
      }
      this.initialized = true;
    } catch {
      this.initialized = true;
    }
  }

  public saveToDisk(): void {
    try {
      const filePath = this.getStorageFilePath();
      const payload = {
        chunks: Array.from(this.chunks.entries()),
        docVersions: Array.from(this.docVersions.entries()),
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      // Ignore write errors in read-only environments
    }
  }

  public count(): number {
    this.loadFromDisk();
    return this.chunks.size;
  }

  public listChunks(): StoredChunk[] {
    this.loadFromDisk();
    return Array.from(this.chunks.values()).filter(
      (c) => !LEGACY_DEMO_DOCS.has(c.document_name)
    );
  }

  public listDocuments(): StoredDocument[] {
    this.loadFromDisk();
    const docs = new Map<string, StoredDocument>();
    for (const c of this.chunks.values()) {
      if (LEGACY_DEMO_DOCS.has(c.document_name)) continue;
      if (!docs.has(c.document_name)) {
        docs.set(c.document_name, {
          document: c.document_name,
          doc_type: c.doc_type,
          chunks: 0,
          version: c.version,
          department: c.department,
          confidentiality: c.confidentiality,
          updated_at: c.updated_at || new Date().toISOString(),
        });
      }
      docs.get(c.document_name)!.chunks += 1;
    }
    return Array.from(docs.values());
  }

  public deleteDocument(documentName: string): number {
    this.loadFromDisk();
    let deleted = 0;
    for (const [cid, chunk] of this.chunks.entries()) {
      if (chunk.document_name === documentName) {
        this.chunks.delete(cid);
        deleted += 1;
      }
    }
    this.docVersions.delete(documentName);
    this.saveToDisk();
    return deleted;
  }

  public clearAll(): void {
    this.chunks.clear();
    this.docVersions.clear();
    this.saveToDisk();
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
    confidentiality: ConfidentialityLevel = 'internal'
  ) {
    if (LEGACY_DEMO_DOCS.has(documentName)) {
      return;
    }
    this.loadFromDisk();
    this.deleteDocument(documentName);
    this.docVersions.set(documentName, version);
    const now = new Date().toISOString();

    for (const c of chunks) {
      const text = c.text;
      const emb =
        c.embedding && c.embedding.length > 0
          ? c.embedding
          : generateDeterministicEmbedding(text);
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
        updated_at: now,
      });
    }
    this.saveToDisk();
  }

  public getChunk(chunkId: string): StoredChunk | undefined {
    this.loadFromDisk();
    return this.chunks.get(chunkId);
  }

  public getChunks(chunkIds: string[]): Record<string, StoredChunk> {
    this.loadFromDisk();
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
    this.loadFromDisk();
    const {
      queryText,
      queryEmbedding,
      docType,
      department,
      topK = 5,
      minSimilarity = 0.35,
    } = params;

    let candidates = Array.from(this.chunks.values()).filter(
      (c) => !LEGACY_DEMO_DOCS.has(c.document_name)
    );
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
      } else if (results.length === 0 && item.similarity >= 0.2) {
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
        if (chunkList.length === 0) return;
        const texts = chunkList.map((c) => c.text);
        const embeddings = await getEmbeddings(texts);
        chunkList.forEach((c, idx) => {
          if (embeddings[idx] && embeddings[idx].length > 0) {
            c.embedding = embeddings[idx];
          }
        });
        this.saveToDisk();
      }
    } catch {
      // Fallback preserved
    }
  }
}

const globalForVectorStore = globalThis as unknown as {
  hybridVectorStore?: HybridVectorStore;
};

if (!globalForVectorStore.hybridVectorStore || typeof globalForVectorStore.hybridVectorStore.listChunks !== 'function') {
  globalForVectorStore.hybridVectorStore = new HybridVectorStore();
}

export const store = globalForVectorStore.hybridVectorStore;
