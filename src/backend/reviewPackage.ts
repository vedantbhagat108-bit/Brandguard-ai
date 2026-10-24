import {
  ChangeHistoryEntry,
  Citation,
  ConfidentialityLevel,
  Finding,
  ReviewPackage,
  ReviewPackageSummary,
  Severity,
  SuggestedEdit,
  UnsupportedClaim,
  UserRole,
} from './types.ts';
import { analyzeContent } from './analyze.ts';
import { extractAndClassifyClaims } from './claims.ts';

const packagesStore = new Map<string, ReviewPackage>();

export function getPackage(packageId: string): ReviewPackage | undefined {
  return packagesStore.get(packageId);
}

export function listPackages(): ReviewPackage[] {
  return Array.from(packagesStore.values());
}

export function savePackage(pkg: ReviewPackage): void {
  packagesStore.set(pkg.package_id, pkg);
}

function computeComplianceScore(findings: Finding[], unsupported: UnsupportedClaim[]): number {
  let score = 100.0;
  for (const f of findings) {
    if (f.severity === 'critical') score -= 25.0;
    else if (f.severity === 'high') score -= 15.0;
    else if (f.severity === 'medium') score -= 6.0;
    else if (f.severity === 'low') score -= 2.0;
  }
  for (const _ of unsupported) {
    score -= 10.0;
  }
  return Math.max(0.0, Number(score.toFixed(1)));
}

function determineRecommendation(
  score: number,
  findings: Finding[],
  unsupported: UnsupportedClaim[],
): 'APPROVED' | 'NEEDS_REVISION' | 'BLOCKED_CRITICAL' {
  const hasCritical = findings.some((f) => f.severity === 'critical') || unsupported.length > 0;
  if (hasCritical || score < 60) return 'BLOCKED_CRITICAL';
  if (score >= 92 && !findings.some((f) => f.severity === 'high')) return 'APPROVED';
  return 'NEEDS_REVISION';
}

export async function generateReviewPackage(params: {
  content: string;
  title?: string;
  creatorId?: string;
  department?: string;
  confidentiality?: ConfidentialityLevel;
  callerRole?: UserRole;
  topK?: number;
}): Promise<ReviewPackage> {
  const {
    content,
    title = 'Brand Governance Review Package',
    creatorId = 'creator-1',
    department = 'marketing',
    confidentiality = 'internal',
    callerRole = 'content_creator',
    topK = 5,
  } = params;

  const packageId = `pkg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  // 1. Extract claims
  const claims = await extractAndClassifyClaims(content);

  // 2. Run Brand Governance Engine Analysis
  const analysis = await analyzeContent(content, department, confidentiality, callerRole, topK);

  // 3. Score & Recommendation
  const score = computeComplianceScore(analysis.findings, analysis.unsupported_claims);
  const recommendation = determineRecommendation(score, analysis.findings, analysis.unsupported_claims);

  const findingsBySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const f of analysis.findings) {
    findingsBySeverity[f.severity] = (findingsBySeverity[f.severity] || 0) + 1;
  }

  const summary: ReviewPackageSummary = {
    total_claims: analysis.claims_checked,
    claims_by_type: analysis.claims_by_type as any,
    findings_by_severity: findingsBySeverity,
    unsupported_claims_count: analysis.unsupported_claims.length,
    knowledge_gaps_count: analysis.knowledge_gaps.length,
    compliance_score: score,
    publication_recommendation: recommendation,
  };

  // 4. Source links
  const seenSources = new Set<string>();
  const sourceLinks: Citation[] = [];
  for (const f of analysis.findings) {
    for (const c of f.citations) {
      const key = `${c.chunk_id}::${c.document}`;
      if (!seenSources.has(key)) {
        seenSources.add(key);
        sourceLinks.push(c);
      }
    }
  }

  // 5. Suggested Edits
  const suggestedEdits: SuggestedEdit[] = [];
  for (const f of analysis.findings) {
    if (f.suggested_fix) {
      suggestedEdits.push({
        original_excerpt: f.excerpt,
        suggested_text: f.suggested_fix,
        reason: f.issue,
        rule_violated: f.rule_violated,
        citations: f.citations,
      });
    }
  }

  // 6. Change history
  const changeHistory: ChangeHistoryEntry[] = [
    {
      timestamp: now,
      action: 'CREATED_REVIEW_PACKAGE',
      actor: creatorId,
      actor_role: callerRole,
      notes: `Review package generated for "${title}". Compliance Score: ${score}%, Status: ${recommendation}`,
    },
  ];

  const pkg: ReviewPackage = {
    package_id: packageId,
    title,
    content_raw: content,
    created_at: now,
    creator_id: creatorId,
    workflow_status: score >= 92 ? 'pending_reviewer' : 'pending_manager',
    summary,
    claims,
    findings: analysis.findings,
    unsupported_claims: analysis.unsupported_claims,
    knowledge_gaps: analysis.knowledge_gaps,
    source_links: sourceLinks,
    suggested_edits: suggestedEdits,
    change_history: changeHistory,
  };

  savePackage(pkg);
  return pkg;
}
