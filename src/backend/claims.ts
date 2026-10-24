import { Claim, ClaimType } from './types.ts';
import { ai, LLM_MODEL, hasValidGeminiKey } from './gemini.ts';

const CLAIM_SYSTEM_PROMPT = `You are an Enterprise Brand Compliance Claim Extraction Engine.
Analyze the submitted marketing, sales, or product copy.
Extract all distinct claims, assertions, and brand statements. Do not split arbitrarily by punctuation.

For each claim:
1. "text": Normalized single standalone claim.
2. "excerpt": Verbatim exact substring copied word-for-word from the original content.
3. "claim_type": One of:
   - "factual": Specific verifiable assertions, data points, metrics, SLAs, uptime numbers, benchmarks, certifications, customer counts, pricing, partnerships.
   - "tonal": Tone of voice, emotional posture, superlatives ("best", "unbeatable", "revolutionary"), humble vs aggressive framing.
   - "terminology": Product naming, capitalization, buzzwords, trademarks, prohibited jargon.
4. "sensitivity_level":
   - "legal_sensitive": Direct guarantees, absolute warranties, regulatory or financial claims.
   - "high_risk": Extreme superlatives, #1 claims, unverified technical benchmarks.
   - "normal": Standard marketing claims.

Return JSON format: {"claims": [{"text": "...", "excerpt": "...", "claim_type": "factual"|"tonal"|"terminology", "sensitivity_level": "normal"|"high_risk"|"legal_sensitive"}]}`;

export async function extractAndClassifyClaims(content: string): Promise<Claim[]> {
  if (!content || content.trim().length < 8) return [];

  // Try LLM Extraction
  if (hasValidGeminiKey) {
    try {
      const genPromise = ai.models.generateContent({
        model: LLM_MODEL,
        contents: [
          { role: 'user', parts: [{ text: `${CLAIM_SYSTEM_PROMPT}\n\nCONTENT:\n"""\n${content}\n"""` }] },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.0,
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Claims extraction timeout')), 5000)
      );

      const response: any = await Promise.race([genPromise, timeoutPromise]);
      const raw = response?.text || '';
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.claims) && parsed.claims.length > 0) {
        return parsed.claims.map((c: any, idx: number) => {
          const excerpt = typeof c.excerpt === 'string' && content.includes(c.excerpt)
            ? c.excerpt.trim()
            : (typeof c.text === 'string' ? c.text.trim() : '');
          return {
            claim_id: `claim-${Date.now().toString(36)}-${idx}`,
            text: c.text || excerpt,
            excerpt: excerpt || content.slice(0, 50),
            claim_type: (['factual', 'tonal', 'terminology'].includes(c.claim_type) ? c.claim_type : 'factual') as ClaimType,
            sensitivity_level: (['normal', 'high_risk', 'legal_sensitive'].includes(c.sensitivity_level) ? c.sensitivity_level : 'normal') as any,
          };
        });
      }
    } catch {
      // Fallback to heuristic parser
    }
  }

  // Robust Heuristic Fallback
  return fallbackClaimExtraction(content);
}

function fallbackClaimExtraction(content: string): Claim[] {
  // Split on sentence boundaries without breaking decimals like 99.9%
  const sentences = content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

  const claims: Claim[] = [];
  sentences.forEach((sent, idx) => {
    const sLower = sent.toLowerCase();
    let cType: ClaimType = 'factual';
    let sens: 'normal' | 'high_risk' | 'legal_sensitive' = 'normal';

    if (/\b\d+(\.\d+)?%|\b\d{2,}\b|\bsla\b|\buptime\b|\bsoc2\b|\biso\b|\bguarantee\b|\bpatent\b|\bpartner\b|\bcertified\b/.test(sLower)) {
      cType = 'factual';
      sens = sLower.includes('guarantee') || sLower.includes('sla') ? 'legal_sensitive' : 'high_risk';
    } else if (/\bunbeatable\b|\brevolutionary\b|\b#1\b|\bbest\b|\bgame-changing\b|\bcutting-edge\b|\bflawless\b|\bzero\b/.test(sLower)) {
      cType = 'tonal';
      sens = 'high_risk';
    } else if (/\bbrandguard\b|\bsynergize\b|\bparadigm\b|\bdisruptor\b|\bthe bot\b|\bthe script\b/.test(sLower)) {
      cType = 'terminology';
      sens = 'normal';
    } else {
      cType = sent.length > 50 ? 'factual' : 'tonal';
    }

    claims.push({
      claim_id: `claim-fb-${Date.now().toString(36)}-${idx}`,
      text: sent,
      excerpt: sent,
      claim_type: cType,
      sensitivity_level: sens,
    });
  });

  return claims;
}
