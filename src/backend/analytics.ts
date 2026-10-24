import { listPackages } from './reviewPackage.ts';

export function getBrandAnalytics() {
  const packages = listPackages();

  const allFindings = packages.flatMap((p) => p.findings);
  const allUnsupported = packages.flatMap((p) => p.unsupported_claims);
  const allGaps = packages.flatMap((p) => p.knowledge_gaps);

  // 1. Repeated Mistakes
  const ruleCounts: Record<string, number> = {};
  for (const f of allFindings) {
    ruleCounts[f.rule_violated] = (ruleCounts[f.rule_violated] || 0) + 1;
  }

  const repeatedMistakes = Object.entries(ruleCounts)
    .map(([rule, count]) => ({ rule, violations_count: count }))
    .sort((a, b) => b.violations_count - a.violations_count)
    .slice(0, 8);

  // 2. Common Issue Types Breakdown
  const categoryCounts: Record<string, number> = {
    tone: 0,
    terminology: 0,
    contradiction: 0,
    unsupported_claim: allUnsupported.length,
  };
  for (const f of allFindings) {
    categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
  }

  // 3. Missing Knowledge Gaps
  const gapCounts: Record<string, number> = {};
  for (const g of allGaps) {
    gapCounts[g.topic] = (gapCounts[g.topic] || 0) + 1;
  }

  const missingKnowledge = Object.entries(gapCounts)
    .map(([topic, count]) => ({ topic, occurrences: count }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 8);

  // 4. Guideline Clarification Proposals
  const suggestedGuidelineUpdates = repeatedMistakes.slice(0, 3).map((item) => ({
    target_rule: item.rule,
    proposal: `Update brand guideline with clear approved vs forbidden phrasing to address ${item.violations_count} detected violations.`,
    requires_human_approval: true,
    status: 'PROPOSED',
  }));

  return {
    total_packages_reviewed: packages.length,
    total_violations_flagged: allFindings.length,
    total_unsupported_claims: allUnsupported.length,
    total_knowledge_gaps: allGaps.length,
    repeated_mistakes: repeatedMistakes,
    common_issue_types: categoryCounts,
    missing_knowledge: missingKnowledge,
    suggested_guideline_updates: suggestedGuidelineUpdates,
    generated_at: new Date().toISOString(),
  };
}
