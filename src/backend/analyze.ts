import {
  Claim,
  ConfidentialityLevel,
  Citation,
  Finding,
  KnowledgeGap,
  Severity,
  UnsupportedClaim,
  UserRole,
} from './types.ts';
import { extractAndClassifyClaims } from './claims.ts';
import { retrieveForClaims, RetrievedChunk } from './retrieve.ts';
import { ai, LLM_MODEL, hasValidGeminiKey } from './gemini.ts';

const UNSUPPORTED_CLAIM_THRESHOLD = 0.52;

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function quoteInText(quote: string, text: string): boolean {
  if (!quote || !text) return false;
  const nQ = norm(quote);
  const nT = norm(text);
  if (nT.includes(nQ)) return true;
  const cQ = nQ.replace(/[^\w\s]/g, '');
  const cT = nT.replace(/[^\w\s]/g, '');
  return cQ.length >= 4 && cT.includes(cQ);
}

const AUDITOR_SYSTEM_PROMPT = `You are an Enterprise Brand Compliance and Governance Auditor.
You receive extracted CLAIMS (factual, tonal, terminology) and BRAND CHUNKS (approved facts and style rules).

CRITICAL BRAND GOVERNANCE RULES:
1. UNSUPPORTED FACTUAL CLAIMS: Every claim tagged as "factual" (numbers, metrics, uptime/SLAs, benchmarks, certifications, customer numbers, partnerships) MUST be explicitly corroborated by the provided approved_fact chunks.
   - If NO approved_fact chunk explicitly corroborates the specific assertion (e.g. claiming NASA certifications, 50 million transactions, unrecorded customers, or unverified SLAs), you MUST report it as category "unsupported_claim" with severity "critical" or "high", citations: [], and rule_violated: "Enterprise Brand Fact Policy: All factual assertions must be substantiated by verified approved facts in the brand repository before publication."
2. FACTUAL CONTRADICTIONS: Flag any claim that contradicts an approved_fact chunk (e.g., claiming 100% bug-free or 100% uptime when approved fact specifies 99.95% SLA) as category "contradiction" with severity "critical", citing the exact chunk_id and quote.
3. STYLE & TONE VIOLATIONS: For chunks of type "style_rule", flag tone breaches, hyperbole, forbidden superlatives ("unbeatable", "revolutionary", "#1"), incorrect product naming ("brandguard" vs "BrandGuard AI"), and corporate jargon as category "tone" or "terminology", citing the chunk_id and quote.
4. "excerpt": Copy the exact verbatim text segment from the claim that contains the problem.
5. "suggested_fix": A concise, brand-compliant rewrite grounded in approved brand knowledge.

JSON Schema:
{
  "findings": [
    {
      "issue": "...",
      "excerpt": "...",
      "rule_violated": "...",
      "category": "tone" | "terminology" | "contradiction" | "unsupported_claim",
      "severity": "critical" | "high" | "medium" | "low",
      "confidence": 0.0 to 1.0,
      "citations": [{"chunk_id": "...", "quote": "..."}],
      "suggested_fix": "..."
    }
  ]
}`;

export interface AnalyzeResult {
  findings: Finding[];
  unsupported_claims: UnsupportedClaim[];
  claims_checked: number;
  claims_by_type: Record<string, number>;
  findings_rejected: number;
  warnings: string[];
  knowledge_gaps: KnowledgeGap[];
}

export async function analyzeContent(
  content: string,
  department: string = 'marketing',
  confidentiality: ConfidentialityLevel = 'internal',
  callerRole: UserRole = 'content_creator',
  topK: number = 5,
): Promise<AnalyzeResult> {
  if (!content || content.trim().length < 8) {
    return {
      findings: [],
      unsupported_claims: [],
      claims_checked: 0,
      claims_by_type: { factual: 0, tonal: 0, terminology: 0 },
      findings_rejected: 0,
      warnings: ['Content too short for analysis.'],
      knowledge_gaps: [],
    };
  }

  // Step 1: Extract claims and classify content types
  const claims = await extractAndClassifyClaims(content);
  if (claims.length === 0) {
    return {
      findings: [],
      unsupported_claims: [],
      claims_checked: 0,
      claims_by_type: { factual: 0, tonal: 0, terminology: 0 },
      findings_rejected: 0,
      warnings: ['No verifiable claims detected in submitted content.'],
      knowledge_gaps: [],
    };
  }

  const claimsByType = {
    factual: claims.filter((c) => c.claim_type === 'factual').length,
    tonal: claims.filter((c) => c.claim_type === 'tonal').length,
    terminology: claims.filter((c) => c.claim_type === 'terminology').length,
  };

  // Step 2: Query brand knowledge separately for approved facts vs style rules
  const retrievedMap = await retrieveForClaims(claims, department, confidentiality, topK);

  const findings: Finding[] = [];
  const unsupportedClaims: UnsupportedClaim[] = [];
  const knowledgeGaps: KnowledgeGap[] = [];
  const claimsForLLM: Claim[] = [];
  const pool: Record<string, RetrievedChunk> = {};

  // Step 3: Unsupported-claim and Knowledge-gap detection
  // Factual claims with no approved-fact evidence need to be flagged instead of silently passing!
  for (const claim of claims) {
    const hits = retrievedMap.get(claim.claim_id) || [];
    for (const h of hits) {
      pool[h.chunk_id] = h;
    }

    if (claim.claim_type === 'factual') {
      const factHits = hits.filter((h) => h.doc_type === 'approved_fact');
      const maxFactSim = factHits.length > 0 ? Math.max(...factHits.map((h) => h.similarity)) : 0;

      // Check threshold: If no approved facts or similarity is below threshold, FLAG IT!
      if (factHits.length === 0 || maxFactSim < UNSUPPORTED_CLAIM_THRESHOLD) {
        const bestDoc = factHits.length > 0 ? factHits[0].document : undefined;
        const reason = `Factual claim has no substantiated approved fact in brand repository (highest match: ${maxFactSim.toFixed(2)} < threshold ${UNSUPPORTED_CLAIM_THRESHOLD.toFixed(2)}).`;
        const action = 'Submit verified documentation to brand legal repository, or remove unsubstantiated figure/claim.';

        unsupportedClaims.push({
          claim_id: claim.claim_id,
          claim_text: claim.text,
          excerpt: claim.excerpt,
          reason,
          highest_similarity: maxFactSim,
          best_candidate_document: bestDoc,
          action_required: action,
        });

        const severity: Severity = claim.sensitivity_level === 'high_risk' || claim.sensitivity_level === 'legal_sensitive'
          ? 'critical'
          : 'high';

        findings.push({
          issue: `Unsupported Factual Claim: "${claim.text}"`,
          excerpt: claim.excerpt,
          rule_violated: 'Enterprise Brand Fact Policy: All factual assertions, SLAs, and performance metrics must be substantiated by approved facts in the brand repository before publication.',
          category: 'unsupported_claim',
          severity,
          confidence: 0.95,
          citations: [],
          suggested_fix: `Provide documentation to add this claim to approved facts, or rephrase "${claim.text}" without unverified figures.`,
          is_knowledge_gap: true,
        });

        knowledgeGaps.push({
          topic: `Missing Brand Fact for claim: "${claim.text.slice(0, 80)}"`,
          claim_excerpt: claim.excerpt,
          recommended_action: `Verify claim with Subject Matter Expert and ingest approved documentation for department "${department}".`,
          created_at: new Date().toISOString(),
        });
      } else {
        claimsForLLM.push(claim);
      }
    } else {
      // Tonal or terminology claims check against style rules
      if (hits.length > 0) {
        claimsForLLM.push(claim);
      }
    }
  }

  // Step 4: LLM comparison against retrieved rules & approved facts
  let rejectedCount = 0;
  const warnings: string[] = [];

  if (claimsForLLM.length > 0 && Object.keys(pool).length > 0 && hasValidGeminiKey) {
    try {
      const chunksStr = Object.values(pool)
        .map((c) => `[chunk_id: ${c.chunk_id}] (${c.doc_type.toUpperCase()}) ${c.document} > ${c.section}\n${c.text}`)
        .join('\n\n');

      const claimsStr = claimsForLLM
        .map((c, i) => `${i + 1}. [Type: ${c.claim_type.toUpperCase()} | Risk: ${c.sensitivity_level}] ${c.text}`)
        .join('\n');

      const prompt = `BRAND REPOSITORY CHUNKS:\n${chunksStr}\n\nCLAIMS TO CHECK:\n${claimsStr}`;

      const genPromise = ai.models.generateContent({
        model: LLM_MODEL,
        contents: [
          { role: 'user', parts: [{ text: `${AUDITOR_SYSTEM_PROMPT}\n\n${prompt}` }] },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.0,
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Auditor evaluation timeout')), 5000)
      );

      const response: any = await Promise.race([genPromise, timeoutPromise]);
      const raw = response?.text || '';
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.findings)) {
        for (const f of parsed.findings) {
          // Strictly verify citations
          const validCitations: Citation[] = [];
          if (Array.isArray(f.citations)) {
            for (const cite of f.citations) {
              const chunk = pool[cite.chunk_id];
              if (chunk && quoteInText(cite.quote, chunk.text)) {
                validCitations.push({
                  chunk_id: chunk.chunk_id,
                  document: chunk.document,
                  section: chunk.section,
                  page: chunk.page,
                  doc_type: chunk.doc_type,
                  quote: cite.quote.trim(),
                  similarity: Number(chunk.similarity.toFixed(4)),
                });
              }
            }
          }

          const isUnsupported = f.category === 'unsupported_claim' || f.issue?.toLowerCase().includes('unsupported');
          if (!quoteInText(f.excerpt, content) || (!isUnsupported && validCitations.length === 0)) {
            rejectedCount += 1;
            continue;
          }

          const bestSim = validCitations.length > 0 ? Math.max(...validCitations.map((c) => c.similarity)) : 0;
          const blendedConfidence = isUnsupported ? 0.95 : Number((0.7 * (f.confidence || 0.8) + 0.3 * Math.min(bestSim, 1.0)).toFixed(2));
          const category = isUnsupported ? 'unsupported_claim' : (validCitations.some((c) => c.doc_type === 'approved_fact') ? 'contradiction' : (f.category || 'tone'));

          if (isUnsupported) {
            unsupportedClaims.push({
              claim_id: `claim-unsup-${Date.now().toString(36)}-${unsupportedClaims.length}`,
              claim_text: f.issue.replace(/^Unsupported Factual Claim:\s*/i, '').replace(/["']/g, ''),
              excerpt: f.excerpt.trim(),
              reason: 'Factual claim has no substantiated approved fact in brand repository.',
              highest_similarity: bestSim,
              best_candidate_document: validCitations[0]?.document,
              action_required: 'Submit verified documentation to brand legal repository, or remove unsubstantiated figure/claim.',
            });
            knowledgeGaps.push({
              topic: `Missing Brand Fact: ${f.excerpt.slice(0, 80)}`,
              claim_excerpt: f.excerpt.trim(),
              recommended_action: `Verify claim with Subject Matter Expert and ingest approved documentation for department "${department}".`,
              created_at: new Date().toISOString(),
            });
          }

          findings.push({
            issue: f.issue || 'Brand compliance issue detected',
            excerpt: f.excerpt.trim(),
            rule_violated: f.rule_violated || 'Brand Governance Rule',
            category: category as any,
            severity: (['critical', 'high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium') as Severity,
            confidence: blendedConfidence,
            citations: validCitations,
            suggested_fix: f.suggested_fix || null,
            is_knowledge_gap: isUnsupported,
          });
        }
      }
    } catch (err: any) {
      warnings.push(`LLM evaluation fallback: ${err.message || err}`);
      // Run heuristic rule matcher
      applyHeuristicViolations(claimsForLLM, pool, content, findings);
    }
  } else if (claimsForLLM.length > 0 && Object.keys(pool).length > 0) {
    // Deterministic rule engine fallback
    applyHeuristicViolations(claimsForLLM, pool, content, findings);
  }

  // Deduplicate findings
  const seen = new Set<string>();
  const uniqueFindings: Finding[] = [];
  for (const f of findings) {
    const key = `${norm(f.excerpt)}::${norm(f.rule_violated)}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFindings.push(f);
    }
  }

  // Sort findings: critical -> high -> medium -> low
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  uniqueFindings.sort((a, b) => order[a.severity] - order[b.severity] || b.confidence - a.confidence);

  // Sync any unsupported_claim findings into unsupportedClaims and knowledgeGaps
  for (const f of uniqueFindings) {
    if (f.category === 'unsupported_claim' && !unsupportedClaims.some((u) => u.excerpt === f.excerpt)) {
      unsupportedClaims.push({
        claim_id: `claim-unsup-${Date.now().toString(36)}-${unsupportedClaims.length}`,
        claim_text: f.issue.replace(/^Unsupported Factual Claim:\s*/i, '').replace(/["']/g, ''),
        excerpt: f.excerpt,
        reason: 'Factual claim has no substantiated approved fact in brand repository.',
        highest_similarity: 0.0,
        best_candidate_document: undefined,
        action_required: 'Submit verified documentation to brand legal repository, or remove unsubstantiated figure/claim.',
      });
      knowledgeGaps.push({
        topic: `Missing Brand Fact: ${f.excerpt.slice(0, 80)}`,
        claim_excerpt: f.excerpt,
        recommended_action: `Verify claim with Subject Matter Expert and ingest approved documentation for department "${department}".`,
        created_at: new Date().toISOString(),
      });
    }
  }

  return {
    findings: uniqueFindings,
    unsupported_claims: unsupportedClaims,
    claims_checked: claims.length,
    claims_by_type: claimsByType,
    findings_rejected: rejectedCount,
    warnings,
    knowledge_gaps: knowledgeGaps,
  };
}

function applyHeuristicViolations(
  claims: Claim[],
  pool: Record<string, RetrievedChunk>,
  fullContent: string,
  findings: Finding[],
) {
  for (const claim of claims) {
    const textLower = claim.text.toLowerCase();

    // Check superlative / hyperbole rules
    if (/\bunbeatable\b|\brevolutionary\b|\b#1\b|\bgame-changing\b/.test(textLower)) {
      const styleChunk = Object.values(pool).find((c) => c.chunk_id === 'style-tone-01' || c.doc_type === 'style_rule');
      if (styleChunk) {
        findings.push({
          issue: `Superlative / Hyperbolic Tone Breach: "${claim.text}"`,
          excerpt: claim.excerpt,
          rule_violated: 'Tone of Voice Guidelines: Never use hyperbole, aggressive superlative words like "unbeatable", "revolutionary", or "#1".',
          category: 'tone',
          severity: 'high',
          confidence: 0.92,
          citations: [
            {
              chunk_id: styleChunk.chunk_id,
              document: styleChunk.document,
              section: styleChunk.section,
              page: styleChunk.page,
              doc_type: styleChunk.doc_type,
              quote: 'Never use hyperbole, aggressive superlative words like "unbeatable", "revolutionary", or "#1".',
              similarity: styleChunk.similarity,
            },
          ],
          suggested_fix: claim.text.replace(/revolutionary|unbeatable|#1/gi, 'enterprise-grade'),
          is_knowledge_gap: false,
        });
      }
    }

    // Check naming rules
    if (/\bbrandguard\b|\bthe bot\b|\bthe script\b/.test(textLower) && !claim.text.includes('BrandGuard AI')) {
      const namingChunk = Object.values(pool).find((c) => c.chunk_id === 'style-naming-02' || c.doc_type === 'style_rule');
      if (namingChunk) {
        findings.push({
          issue: 'Incorrect Product Terminology & Casing',
          excerpt: claim.excerpt,
          rule_violated: 'Product Naming: Always write and capitalize "BrandGuard AI". Never refer to BrandGuard as "the script", "the bot", or uncapitalized "brandguard".',
          category: 'terminology',
          severity: 'high',
          confidence: 0.95,
          citations: [
            {
              chunk_id: namingChunk.chunk_id,
              document: namingChunk.document,
              section: namingChunk.section,
              page: namingChunk.page,
              doc_type: namingChunk.doc_type,
              quote: 'Always write and capitalize "BrandGuard AI". Never refer to BrandGuard as "the script", "the bot", or uncapitalized "brandguard".',
              similarity: namingChunk.similarity,
            },
          ],
          suggested_fix: claim.text.replace(/\bbrandguard\b|\bthe bot\b|\bthe script\b/gi, 'BrandGuard AI'),
          is_knowledge_gap: false,
        });
      }
    }

    // Check 100% bug free / absolute guarantee
    if (/\b100% bug-free\b|\bnever fails\b|\bunbreakable security\b/.test(textLower)) {
      const legalChunk = Object.values(pool).find((c) => c.chunk_id === 'style-legal-03' || c.doc_type === 'style_rule');
      if (legalChunk) {
        findings.push({
          issue: 'Prohibited Absolute Zero-Defect Guarantee',
          excerpt: claim.excerpt,
          rule_violated: 'Legal & Guarantees: Never make absolute claims or zero-defect promises such as "100% bug-free", "unbreakable security", or "never fails".',
          category: 'contradiction',
          severity: 'critical',
          confidence: 0.98,
          citations: [
            {
              chunk_id: legalChunk.chunk_id,
              document: legalChunk.document,
              section: legalChunk.section,
              page: legalChunk.page,
              doc_type: legalChunk.doc_type,
              quote: 'Never make absolute claims or zero-defect promises such as "100% bug-free", "unbreakable security", or "never fails".',
              similarity: legalChunk.similarity,
            },
          ],
          suggested_fix: claim.text.replace(/100% bug-free|never fails|unbreakable security/gi, 'rigorously tested with 99.95% SLA uptime'),
          is_knowledge_gap: false,
        });
      }
    }

    // Check SLA contradiction (e.g. 100% uptime vs 99.95% approved fact)
    if (/\b100% uptime\b|\bzero downtime\b/.test(textLower)) {
      const slaChunk = Object.values(pool).find((c) => c.chunk_id === 'fact-sla-01' || c.doc_type === 'approved_fact');
      if (slaChunk) {
        findings.push({
          issue: 'Contradicts Verified SLA Uptime Benchmark',
          excerpt: claim.excerpt,
          rule_violated: 'Service Level Agreement: BrandGuard AI contracts guarantee an SLA uptime of 99.95% backed by financial credit remedies.',
          category: 'contradiction',
          severity: 'critical',
          confidence: 0.96,
          citations: [
            {
              chunk_id: slaChunk.chunk_id,
              document: slaChunk.document,
              section: slaChunk.section,
              page: slaChunk.page,
              doc_type: slaChunk.doc_type,
              quote: 'BrandGuard AI contracts guarantee an SLA uptime of 99.95% backed by financial credit remedies for enterprise subscribers.',
              similarity: slaChunk.similarity,
            },
          ],
          suggested_fix: claim.text.replace(/100% uptime|zero downtime/gi, 'contractual 99.95% SLA uptime'),
          is_knowledge_gap: false,
        });
      }
    }

    // Check unsupported factual claims that assert specific metrics or certifications not corroborated
    if (claim.claim_type === 'factual') {
      const factChunks = Object.values(pool).filter((c) => c.doc_type === 'approved_fact');
      const allFactText = factChunks.map((c) => c.text.toLowerCase()).join(' ');

      const hasSpecificUnverifiedAssertion =
        /\b\d{2,}\s*(million|billion|k|m)\b|\bnasa\b|\bpatent\b|\bzero defects\b|\b50\s*million\b/i.test(textLower);

      const isSubstantiated =
        (textLower.includes('99.95') && allFactText.includes('99.95')) ||
        (textLower.includes('1,200') && allFactText.includes('1,200')) ||
        (textLower.includes('soc2') && allFactText.includes('soc2')) ||
        (textLower.includes('45ms') && allFactText.includes('45ms'));

      if (hasSpecificUnverifiedAssertion && !isSubstantiated) {
        findings.push({
          issue: `Unsupported Factual Claim: "${claim.text}"`,
          excerpt: claim.excerpt,
          rule_violated: 'Enterprise Brand Fact Policy: All factual assertions, SLAs, and performance metrics must be substantiated by approved facts in the brand repository before publication.',
          category: 'unsupported_claim',
          severity: 'critical',
          confidence: 0.96,
          citations: [],
          suggested_fix: `Provide verified documentation to add this claim to approved facts, or rephrase "${claim.text}" without unverified figures.`,
          is_knowledge_gap: true,
        });
      }
    }
  }
}
