import type {
  ApprovedFact,
  KnowledgeSource,
  PolicyRule,
  WorkspaceProfile,
} from "@/lib/types";

export const workspace: WorkspaceProfile = {
  name: "Aurelia Skin",
  legalName: "Aurelia Skin Labs Pvt. Ltd.",
  site: "aureliaskin.com",
  tagline: "Considered skincare, backed by evidence.",
  knowledgeVersion: "v2.4",
  knowledgeUpdatedAt: "2026-10-12T09:30:00.000Z",
  region: "India · Global social",
};

export const knowledgeSources: KnowledgeSource[] = [
  {
    id: "src_claims",
    title: "Claims & Advertising Policy",
    type: "Policy",
    version: "2.4",
    owner: "Brand Compliance",
    approvedBy: "Manya Iyer",
    approvedAt: "2026-10-12T09:30:00.000Z",
    sections: 18,
    description:
      "The source of truth for product claims, substantiation and comparative advertising.",
    status: "approved",
  },
  {
    id: "src_social",
    title: "Social Media Playbook",
    type: "Playbook",
    version: "1.8",
    owner: "Social & Community",
    approvedBy: "Manya Iyer",
    approvedAt: "2026-10-08T11:00:00.000Z",
    sections: 12,
    description:
      "Channel-specific rules for disclosures, creator partnerships and community copy.",
    status: "approved",
  },
  {
    id: "src_tone",
    title: "Brand Terminology & Tone Guide",
    type: "Guide",
    version: "3.1",
    owner: "Brand Studio",
    approvedBy: "Manya Iyer",
    approvedAt: "2026-09-30T14:15:00.000Z",
    sections: 9,
    description:
      "Approved vocabulary, plain-language guidance and the Aurelia voice principles.",
    status: "approved",
  },
  {
    id: "src_facts",
    title: "Glow Renewal Serum — Approved Claims",
    type: "Fact sheet",
    version: "1.2",
    owner: "Product Marketing",
    approvedBy: "Manya Iyer",
    approvedAt: "2026-10-14T08:20:00.000Z",
    sections: 6,
    description:
      "Consumer-study wording and ingredient concentrations cleared for external use.",
    status: "approved",
  },
  {
    id: "src_offers",
    title: "Offers, Pricing & Promotions Guide",
    type: "Policy",
    version: "2.0",
    owner: "Growth Marketing",
    approvedBy: "Manya Iyer",
    approvedAt: "2026-10-10T10:00:00.000Z",
    sections: 7,
    description:
      "Required terms for discounts, free shipping, bundles and time-limited offers.",
    status: "approved",
  },
  {
    id: "src_access",
    title: "Accessible Content Standards",
    type: "Guide",
    version: "1.3",
    owner: "Brand Studio",
    approvedBy: "Manya Iyer",
    approvedAt: "2026-09-24T16:40:00.000Z",
    sections: 5,
    description:
      "Editorial and visual accessibility checks for social, email and web content.",
    status: "approved",
  },
];

export const policyRules: PolicyRule[] = [
  {
    id: "rule_clm_01",
    code: "CLM-01",
    title: "No cure, treatment or prevention claims",
    category: "Claims",
    defaultSeverity: "critical",
    description:
      "Cosmetic skincare can change the look of skin, but cannot be presented as a medicine.",
    requirement:
      "Use appearance-based language only. Never say a product cures, treats, heals, prevents or diagnoses a condition.",
    approvedExample:
      "Helps visibly reduce the look of blemishes in 7 days.",
    sourceId: "src_claims",
  },
  {
    id: "rule_clm_02",
    code: "CLM-02",
    title: "Efficacy claims need an approved study",
    category: "Claims",
    defaultSeverity: "high",
    description:
      "Every efficacy claim must match an approved study and retain its original wording.",
    requirement:
      "Include the approved study ID with the claim. Do not change percentages, sample sizes or study durations.",
    approvedExample:
      "In a 12-week consumer study, 87% reported smoother-looking skin (Study AUR-2025-014).",
    sourceId: "src_claims",
  },
  {
    id: "rule_clm_03",
    code: "CLM-03",
    title: "Absolute and superlative claims need proof",
    category: "Claims",
    defaultSeverity: "high",
    description:
      "Words such as 100%, #1, best and guaranteed imply a level of proof that is difficult to defend.",
    requirement:
      "Replace absolutes with specific, substantiated statements or remove them entirely.",
    approvedExample:
      "A gentle retinol alternative, formulated for most skin types.",
    sourceId: "src_claims",
  },
  {
    id: "rule_dsc_01",
    code: "DSC-01",
    title: "Paid partnerships need a clear disclosure",
    category: "Disclosure",
    defaultSeverity: "critical",
    description:
      "Audiences must recognise paid content before they engage with it.",
    requirement:
      "Add #ad clearly at the start of the copy. On Instagram it must appear in the first 125 characters.",
    approvedExample:
      "#ad · Meet Glow Renewal Serum, our new daily brightening serum.",
    sourceId: "src_social",
  },
  {
    id: "rule_dsc_02",
    code: "DSC-02",
    title: "Offers need eligibility and end dates",
    category: "Disclosure",
    defaultSeverity: "medium",
    description:
      "Discount, free-shipping and money-back messages must be complete enough for a consumer to understand.",
    requirement:
      "State eligibility, exclusions and a clear end date. Never use open-ended incentives such as 'forever'.",
    approvedExample:
      "Free standard shipping on orders over ₹999. Offer ends 30 Nov 2026. T&Cs apply.",
    sourceId: "src_offers",
  },
  {
    id: "rule_trm_01",
    code: "TRM-01",
    title: "Use approved product terminology",
    category: "Terminology",
    defaultSeverity: "medium",
    description:
      "Vague safety language can imply regulatory certification that the brand does not hold.",
    requirement:
      "Avoid 'chemical-free', 'non-toxic' and 'clean' as safety claims. Use a specific free-from statement.",
    approvedExample:
      "Formulated without parabens, sulfates or mineral oil.",
    sourceId: "src_tone",
  },
  {
    id: "rule_ton_01",
    code: "TON-01",
    title: "Avoid fear-based or shaming language",
    category: "Tone",
    defaultSeverity: "medium",
    description:
      "Aurelia speaks with warmth and never suggests that a person's skin is a problem to fix.",
    requirement:
      "Remove fear, shame and urgency about appearance. Focus on the sensory or care experience.",
    approvedExample:
      "Give your skin a fresh, healthy-looking glow.",
    sourceId: "src_tone",
  },
  {
    id: "rule_ton_02",
    code: "TON-02",
    title: "Prefer plain-language explanations",
    category: "Tone",
    defaultSeverity: "low",
    description:
      "Technical jargon creates distance and is harder to translate across markets.",
    requirement:
      "Replace clinical jargon with a short, everyday explanation or define it in plain words.",
    approvedExample:
      "Supports the skin's natural moisture barrier, the outer layer that helps hold in water.",
    sourceId: "src_tone",
  },
  {
    id: "rule_reg_01",
    code: "REG-01",
    title: "No disparaging competitor claims",
    category: "Regulatory",
    defaultSeverity: "high",
    description:
      "Comparative marketing must be fair, like-for-like and supported by current evidence.",
    requirement:
      "Do not mock or misrepresent competitors. Rewrite comparisons as a positive brand statement.",
    approvedExample:
      "A lightweight daily serum designed for comfortable layering.",
    sourceId: "src_claims",
  },
  {
    id: "rule_acc_01",
    code: "ACC-01",
    title: "Keep social copy accessible",
    category: "Accessibility",
    defaultSeverity: "low",
    description:
      "Emoji overload and all-caps runs can be difficult for screen readers and assistive technology.",
    requirement:
      "Use three emoji or fewer, avoid long all-caps strings and provide descriptive alt text.",
    approvedExample:
      "Glow Renewal Serum, now available. Alt text: amber glass serum bottle on a linen background.",
    sourceId: "src_access",
  },
];

export const approvedFacts: ApprovedFact[] = [
  {
    id: "fact_001",
    product: "Glow Renewal Serum",
    claim:
      "In a 12-week consumer study of 112 participants, 87% reported smoother-looking skin.",
    studyId: "AUR-2025-014",
    sourceId: "src_facts",
    approvedOn: "2026-10-14T08:20:00.000Z",
  },
  {
    id: "fact_002",
    product: "Glow Renewal Serum",
    claim:
      "Formulated with 0.5% bakuchiol and 2% niacinamide. Vegan and fragrance-free.",
    studyId: "AUR-2025-009",
    sourceId: "src_facts",
    approvedOn: "2026-10-14T08:20:00.000Z",
  },
  {
    id: "fact_003",
    product: "Barrier Repair Moisturiser",
    claim:
      "In a 12-week consumer study, 91% agreed their skin felt more hydrated (Study AUR-2025-021).",
    studyId: "AUR-2025-021",
    sourceId: "src_facts",
    approvedOn: "2026-10-14T08:20:00.000Z",
  },
  {
    id: "fact_004",
    product: "SPF 50 Daily Fluid",
    claim:
      "Broad-spectrum SPF 50 protection. Apply generously and reapply every two hours.",
    studyId: "AUR-2025-030",
    sourceId: "src_facts",
    approvedOn: "2026-10-14T08:20:00.000Z",
  },
];

export const sourceSnippets: Record<string, string> = {
  src_claims:
    "Cosmetic products may not claim to cure, treat, prevent or diagnose a medical condition. Efficacy claims must reference an approved study ID without altering its wording. Absolute or superlative claims require written substantiation approved by Brand Compliance.",
  src_social:
    "Paid partnerships must be disclosed clearly and conspicuously. For Instagram, include #ad in the first 125 characters. Do not rely on platform tags alone. Community copy should feel warm, never shaming.",
  src_tone:
    "Avoid 'chemical-free', 'non-toxic' and 'clean' as implied safety claims. Prefer specific free-from statements. Write with warmth and respect; never use fear, shame or urgency about a person's appearance. Replace technical jargon with plain-language explanations.",
  src_facts:
    "Approved Glow Renewal Serum wording: 'In a 12-week consumer study of 112 participants, 87% reported smoother-looking skin.' Study ID AUR-2025-014. Formula contains 0.5% bakuchiol and 2% niacinamide. Do not infer safety for every skin type from ingredient concentration alone.",
  src_offers:
    "Free-shipping, discount and money-back offers must state eligibility, exclusions and a clear end date. 'Forever' and perpetual discounts are prohibited. Show the minimum order value beside any free-shipping message.",
  src_access:
    "Keep social copy accessible: use no more than three emoji, avoid long all-caps runs, and provide descriptive alt text for every visual. Use meaningful link text rather than 'click here'.",
};

export function getPolicyRule(ruleId: string) {
  return policyRules.find((rule) => rule.id === ruleId);
}

export function getKnowledgeSource(sourceId: string) {
  return knowledgeSources.find((source) => source.id === sourceId);
}
