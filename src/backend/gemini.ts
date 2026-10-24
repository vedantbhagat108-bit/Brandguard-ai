import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const rawKey = (process.env.GEMINI_API_KEY || '').trim();
export const hasValidGeminiKey = Boolean(rawKey && !rawKey.startsWith('MY_') && rawKey.length > 15);
export const apiKey = hasValidGeminiKey ? rawKey : '';

export const ai = new GoogleGenAI({
  apiKey: apiKey || 'dummy-key-for-init',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export const LLM_MODEL = 'gemini-3.8-flash';
export const EMBED_MODEL = 'gemini-embedding-2-preview';
export const EMBED_DIM = 768;

/**
 * Deterministic pseudo-embedding for testing or when API quota is exhausted.
 */
export function generateDeterministicEmbedding(text: string, dim: number = EMBED_DIM): number[] {
  const vec = new Array(dim).fill(0);
  const words = text.toLowerCase().match(/\b\w+\b/g) || [text];
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    }
    const absHash = Math.abs(hash);
    for (let j = 0; j < 4; j++) {
      const idx = (absHash + j * 97) % dim;
      vec[idx] += (((absHash >> (j * 4)) & 0xff) / 128.0) - 1.0;
    }
  }
  let sumSq = 0;
  for (let i = 0; i < dim; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vec[i] = Number((vec[i] / norm).toFixed(6));
  } else {
    vec[0] = 1.0;
  }
  return vec;
}

/**
 * Generate 768-dim embeddings using Gemini API with automatic fallback.
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (!hasValidGeminiKey || texts.length === 0) {
    return texts.map((t) => generateDeterministicEmbedding(t));
  }

  const results: number[][] = [];
  for (const text of texts) {
    try {
      const embedPromise = ai.models.embedContent({
        model: EMBED_MODEL,
        contents: text,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Embedding timeout')), 4000)
      );

      const response: any = await Promise.race([embedPromise, timeoutPromise]);
      const vals = response?.embeddings?.[0]?.values || response?.embedding?.values;
      if (vals && vals.length > 0) {
        results.push(vals.slice(0, EMBED_DIM));
      } else {
        results.push(generateDeterministicEmbedding(text));
      }
    } catch {
      results.push(generateDeterministicEmbedding(text));
    }
  }
  return results;
}
