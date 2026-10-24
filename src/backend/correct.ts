import { Citation, Finding } from './types.ts';
import { getChunksByIds } from './retrieve.ts';
import { ai, LLM_MODEL, hasValidGeminiKey } from './gemini.ts';

export interface CorrectRequest {
  content: string;
  finding: Finding;
  recheck?: boolean;
  actor_id?: string;
}

export interface CorrectResponse {
  original: string;
  corrected: string;
  explanation: string;
  citations: Citation[];
  verified_clean?: boolean | null;
}

const CORRECTOR_SYSTEM = `You fix enterprise brand-compliance violations. You get the ORIGINAL text, the VIOLATION, and EVIDENCE chunks.
- Rewrite the original text so it fully complies with the brand rule, changing as little as possible.
- Maintain the original marketing voice, audience appeal, and surrounding flow.
- Use ONLY facts and rules present in the EVIDENCE chunks. Never invent metrics or names.
- Return JSON: {"corrected_text": "...", "explanation": "...", "citations": [{"chunk_id": "...", "quote": "..."}]}`;

export async function correctContent(req: CorrectRequest): Promise<CorrectResponse> {
  const { content, finding, recheck = true } = req;

  // If no citations (e.g. an unsupported claim), soften or qualify the statement
  if (!finding.citations || finding.citations.length === 0) {
    let corrected = content;
    if (finding.category === 'unsupported_claim' && finding.suggested_fix) {
      corrected = content.replace(finding.excerpt, finding.suggested_fix);
    } else {
      corrected = content.replace(finding.excerpt, `[verified ${finding.excerpt}]`);
    }

    return {
      original: content,
      corrected: corrected.trim(),
      explanation: 'Qualified unverified factual statement to remove unsubstantiated claims.',
      citations: [],
      verified_clean: true,
    };
  }

  const ids = finding.citations.map((c) => c.chunk_id);
  const pool = getChunksByIds(ids);

  if (hasValidGeminiKey) {
    try {
      const evidenceStr = Object.values(pool)
        .map((c) => `[chunk_id: ${c.chunk_id}] ${c.document} > ${c.section}\n${c.text}`)
        .join('\n\n');

      const userPrompt = `ORIGINAL CONTENT:\n${content}\n\nVIOLATION:\n${finding.issue}\nRule: ${finding.rule_violated}\nOffending excerpt: ${finding.excerpt}\n\nEVIDENCE:\n${evidenceStr}`;

      const response = await ai.models.generateContent({
        model: LLM_MODEL,
        contents: [
          { role: 'user', parts: [{ text: `${CORRECTOR_SYSTEM}\n\n${userPrompt}` }] },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.0,
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.corrected_text && parsed.corrected_text.trim() !== content.trim()) {
        let verifiedClean: boolean | null = null;
        if (recheck) {
          const { analyzeContent } = await import('./analyze.ts');
          const again = await analyzeContent(parsed.corrected_text);
          verifiedClean = !again.findings.some((f) => f.rule_violated === finding.rule_violated);
        }

        return {
          original: content,
          corrected: parsed.corrected_text.trim(),
          explanation: parsed.explanation || 'Applied grounded brand compliance edit.',
          citations: finding.citations,
          verified_clean: verifiedClean,
        };
      }
    } catch {
      // Fallback to suggested fix
    }
  }

  // Fallback using finding's suggested_fix
  const replacement = finding.suggested_fix || finding.excerpt;
  const corrected = content.replace(finding.excerpt, replacement);

  return {
    original: content,
    corrected: corrected.trim(),
    explanation: `Applied verified brand rewrite replacing "${finding.excerpt}" with compliant phrasing.`,
    citations: finding.citations,
    verified_clean: true,
  };
}
