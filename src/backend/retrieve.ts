import { Claim, ConfidentialityLevel, DocType } from './types.ts';
import { store, StoredChunk } from './store.ts';
import { getEmbeddings } from './gemini.ts';

export interface RetrievedChunk {
  chunk_id: string;
  text: string;
  document: string;
  section: string;
  page: number;
  doc_type: DocType;
  department: string;
  confidentiality: ConfidentialityLevel;
  similarity: number;
}

function chunkToRetrieved(c: StoredChunk, sim: number): RetrievedChunk {
  return {
    chunk_id: c.chunk_id,
    text: c.text,
    document: c.document_name,
    section: c.section,
    page: c.page,
    doc_type: c.doc_type,
    department: c.department,
    confidentiality: c.confidentiality,
    similarity: sim,
  };
}

export async function retrieveHybrid(
  query: string,
  docType?: DocType,
  department: string = 'marketing',
  confidentiality: ConfidentialityLevel = 'internal',
  topK: number = 5,
): Promise<RetrievedChunk[]> {
  const embeddings = await getEmbeddings([query]);
  const emb = embeddings[0];

  const results = store.queryHybrid({
    queryText: query,
    queryEmbedding: emb,
    docType,
    department,
    maxConfidentiality: confidentiality,
    topK,
  });

  return results.map((r) => chunkToRetrieved(r.chunk, r.similarity));
}

export async function retrieveForClaims(
  claims: Claim[],
  department: string = 'marketing',
  confidentiality: ConfidentialityLevel = 'internal',
  topK: number = 5,
): Promise<Map<string, RetrievedChunk[]>> {
  const map = new Map<string, RetrievedChunk[]>();
  if (claims.length === 0) return map;

  const claimTexts = claims.map((c) => c.text);
  const embeddings = await getEmbeddings(claimTexts);

  claims.forEach((claim, idx) => {
    const qVec = embeddings[idx];
    const hits: RetrievedChunk[] = [];

    if (claim.claim_type === 'factual') {
      // Query approved facts specifically
      const factHits = store.queryHybrid({
        queryText: claim.text,
        queryEmbedding: qVec,
        docType: 'approved_fact',
        department,
        maxConfidentiality: confidentiality,
        topK,
      });
      hits.push(...factHits.map((r) => chunkToRetrieved(r.chunk, r.similarity)));

      // If legal or high risk, also check style rules for prohibition clauses
      if (claim.sensitivity_level === 'legal_sensitive' || claim.sensitivity_level === 'high_risk') {
        const ruleHits = store.queryHybrid({
          queryText: claim.text,
          queryEmbedding: qVec,
          docType: 'style_rule',
          department,
          maxConfidentiality: confidentiality,
          topK: 2,
        });
        hits.push(...ruleHits.map((r) => chunkToRetrieved(r.chunk, r.similarity)));
      }
    } else {
      // Tonal or terminology claim: query style rules specifically
      const ruleHits = store.queryHybrid({
        queryText: claim.text,
        queryEmbedding: qVec,
        docType: 'style_rule',
        department,
        maxConfidentiality: confidentiality,
        topK,
      });
      hits.push(...ruleHits.map((r) => chunkToRetrieved(r.chunk, r.similarity)));
    }

    // Deduplicate by chunk_id
    const seen = new Set<string>();
    const unique: RetrievedChunk[] = [];
    for (const h of hits) {
      if (!seen.has(h.chunk_id)) {
        seen.add(h.chunk_id);
        unique.push(h);
      }
    }

    map.set(claim.claim_id, unique);
  });

  return map;
}

export function getChunksByIds(ids: string[]): Record<string, RetrievedChunk> {
  const raw = store.getChunks(ids);
  const res: Record<string, RetrievedChunk> = {};
  for (const [id, c] of Object.entries(raw)) {
    res[id] = chunkToRetrieved(c, 1.0);
  }
  return res;
}
