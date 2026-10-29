import type {
  ApprovedFact,
  KnowledgeSource,
  PolicyRule,
  WorkspaceProfile,
} from "@/lib/types";

export const workspace: WorkspaceProfile = {
  name: "BrandLens Workspace",
  legalName: "BrandLens Governance Repository",
  site: "brandlens.app",
  tagline: "Evidence-linked brand compliance, grounded in your uploaded documents.",
  knowledgeVersion: "v1.0",
  knowledgeUpdatedAt: new Date().toISOString(),
  region: "Global",
};

export const knowledgeSources: KnowledgeSource[] = [];

export const policyRules: PolicyRule[] = [];

export const approvedFacts: ApprovedFact[] = [];

export const sourceSnippets: Record<string, string> = {};

export function getPolicyRule(ruleId: string) {
  return policyRules.find((rule) => rule.id === ruleId);
}

export function getKnowledgeSource(sourceId: string) {
  return knowledgeSources.find((source) => source.id === sourceId);
}
