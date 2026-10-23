import { getKnowledgeSource, getPolicyRule, policyRules } from "@/lib/mock/policy-data";
import { SEVERITY_WEIGHTS } from "@/lib/review-config";
import type {
  AnalysisResult,
  Finding,
  FindingCategory,
  KnowledgeGap,
  PolicyRule,
  ReviewSubmission,
  Severity,
} from "@/lib/types";

type Candidate = {
  ruleId: string;
  evidence: string;
  start: number;
  end: number;
  explanation: string;
  suggestedFix: string;
  confidence: number;
  severity?: Severity;
  title?: string;
};

const SECTION_LABELS: Record<string, string> = {
  rule_clm_01: "§2.1 · Medical claims",
  rule_clm_02: "§2.3 · Claim substantiation",
  rule_clm_03: "§2.5 · Absolute claims",
  rule_dsc_01: "§4.2 · Paid partnerships",
  rule_dsc_02: "§3.1 · Offer terms",
  rule_trm_01: "§1.4 · Words we avoid",
  rule_ton_01: "§3.2 · Voice principles",
  rule_ton_02: "§3.4 · Plain language",
  rule_reg_01: "§2.7 · Comparative claims",
  rule_acc_01: "§2.2 · Social accessibility",
};

function ruleFor(ruleId: string): PolicyRule {
  const rule = getPolicyRule(ruleId);
  if (!rule) throw new Error(`Unknown policy rule: ${ruleId}`);
  return rule;
}

function buildSource(rule: PolicyRule) {
  const source = getKnowledgeSource(rule.sourceId);
  return {
    sourceId: rule.sourceId,
    title: source?.title ?? "Brand policy",
    section: SECTION_LABELS[rule.id] ?? "Approved guidance",
    quote: rule.requirement,
    version: source?.version ?? "1.0",
    approvedBy: source?.approvedBy ?? "Brand Compliance",
    updatedAt: source?.approvedAt ?? new Date().toISOString(),
  };
}

function addCandidate(
  candidates: Candidate[],
  content: string,
  ruleId: string,
  evidence: string,
  explanation: string,
  suggestedFix: string,
  options?: { severity?: Severity; confidence?: number; title?: string },
) {
  const start = content.indexOf(evidence);
  if (start < 0) return;
  candidates.push({
    ruleId,
    evidence,
    start,
    end: start + evidence.length,
    explanation,
    suggestedFix,
    confidence: options?.confidence ?? 0.92,
    severity: options?.severity,
    title: options?.title,
  });
}

function addRegexMatches(
  candidates: Candidate[],
  content: string,
  ruleId: string,
  regex: RegExp,
  build: (evidence: string) => {
    explanation: string;
    fix: string;
    severity?: Severity;
    confidence?: number;
    title?: string;
  },
  limit = 2,
) {
  let count = 0;
  regex.lastIndex = 0;
  for (const match of content.matchAll(regex)) {
    if (count >= limit) break;
    const evidence = match[0].trim().replace(/[,\s]+$/, "");
    if (!evidence) continue;
    const detail = build(evidence);
    addCandidate(
      candidates,
      content,
      ruleId,
      evidence,
      detail.explanation,
      detail.fix,
      {
        severity: detail.severity,
        confidence: detail.confidence,
        title: detail.title,
      },
    );
    count += 1;
  }
}

function fixMedicalClaim(evidence: string) {
  const timeframe = evidence.match(/\bin\s+\d+\s+(?:days?|weeks?|months?)\b/i)?.[0];
  const suffix = timeframe ? ` ${timeframe}` : "";
  if (/acne|blemish|breakout/i.test(evidence)) {
    return `helps visibly reduce the look of blemishes${suffix}`;
  }
  if (/wrinkle|fine line|line/i.test(evidence)) {
    return `helps visibly smooth the look of fine lines${suffix}`;
  }
  if (/dry|dryness|dehydrat/i.test(evidence)) {
    return `helps skin feel more hydrated${suffix}`;
  }
  return `helps visibly improve the look of the skin${suffix}`;
}

function detectFindings(submission: ReviewSubmission): Candidate[] {
  const content = submission.content;
  const candidates: Candidate[] = [];

  // CLM-01 — medical / curative language.
  addRegexMatches(
    candidates,
    content,
    "rule_clm_01",
    /\b(?:clinically\s+)?(?:cures?|curing|cured|treats?|treating|heals?|healing|prevents?|preventing)\b[^.!?\n]{0,64}/gi,
    (evidence) => ({
      title: "Medical or curative claim",
      explanation:
        "This reads as a medical claim about a cosmetic product. Aurelia cannot suggest that a product cures, treats or prevents a condition, and the approved claims library has no medical evidence for this wording.",
      fix: fixMedicalClaim(evidence),
      confidence: 0.97,
    }),
    2,
  );

  // CLM-02 — clinical proof without an approved study.
  addRegexMatches(
    candidates,
    content,
    "rule_clm_02",
    /\b(?:clinically\s+proven|scientifically\s+proven|proven\s+to)\b[^.!?\n,]{0,72}/gi,
    (evidence) => ({
      title: "Efficacy claim needs an approved study",
      explanation:
        "The draft presents this as proven without citing a study. Approved wording for Glow Renewal Serum is the 12-week consumer study AUR-2025-014; percentages and study conditions cannot be changed.",
      fix:
        /overnight|repair|barrier/i.test(evidence)
          ? "supported by a 12-week consumer study where 91% agreed their skin felt more hydrated (Study AUR-2025-021)"
          : "supported by a 12-week consumer study where 87% reported smoother-looking skin (Study AUR-2025-014)",
      confidence: 0.94,
    }),
    2,
  );

  addRegexMatches(
    candidates,
    content,
    "rule_clm_02",
    /\bdermatologist[- ](?:approved|recommended)\b/gi,
    () => ({
      title: "Unsupported professional endorsement",
      explanation:
        "The phrase suggests a dermatologist endorsement that is not recorded in the approved claims library. Describe the actual relationship (for example, 'developed with our dermatology advisory panel') only if it can be evidenced.",
      fix: "developed with our dermatology advisory panel",
      confidence: 0.9,
    }),
    1,
  );

  // CLM-03 — absolutes and guarantees.
  addRegexMatches(
    candidates,
    content,
    "rule_clm_03",
    /\b100%\s+(?:chemical[- ]free|natural|safe|effective|clean)(?:\s+formula)?\b/gi,
    () => ({
      title: "Unsubstantiated absolute claim",
      explanation:
        "Nothing formulated in a laboratory is '100% chemical-free', and absolute safety language cannot be substantiated. Replace it with the specific free-from statement approved for this product.",
      fix: "formulated without parabens, sulfates or mineral oil",
      confidence: 0.96,
    }),
    1,
  );

  addRegexMatches(
    candidates,
    content,
    "rule_clm_03",
    /\b(?:the\s+)?#1\b[^.!?\n]{0,55}/gi,
    () => ({
      title: "Unsupported number-one claim",
      explanation:
        "A '#1' claim needs a named, current and independently verifiable source. No approved ranking exists for this product, so the comparison should be removed.",
      fix: "a gentle retinol alternative",
      confidence: 0.93,
    }),
    1,
  );

  addRegexMatches(
    candidates,
    content,
    "rule_clm_03",
    /\bguaranteed?\b[^.!?\n—]{0,55}/gi,
    () => ({
      title: "Guarantee claim",
      explanation:
        "Guarantees create a consumer expectation the brand cannot always control. A promise to erase a visible concern is also too close to a medical outcome, so this is a critical blocker.",
      fix: "designed to help improve the look of skin",
      severity: "critical",
      confidence: 0.95,
    }),
    1,
  );

  addRegexMatches(
    candidates,
    content,
    "rule_clm_03",
    /\b(?:every|all)\s+skin\s+types?\b[^.!?\n]{0,35}/gi,
    () => ({
      title: "Unqualified suitability claim",
      explanation:
        "A blanket suitability claim is difficult to support across all skin types. Approved guidance recommends a qualified statement with a patch-test reminder.",
      fix: "formulated for most skin types; patch test recommended",
      confidence: 0.91,
    }),
    1,
  );

  addRegexMatches(
    candidates,
    content,
    "rule_clm_03",
    /\b(?:leaves?\s+)?no\s+white\s+cast\b/gi,
    () => ({
      title: "Qualify absolute cosmetic benefits",
      explanation:
        "A no-white-cast claim depends on skin tone and application. Qualify the benefit so the copy does not promise an identical finish for everyone.",
      fix: "designed to minimise white cast on most skin tones",
      severity: "low",
      confidence: 0.84,
    }),
    1,
  );

  // CLM-02 — efficacy statistics without a citation.
  addRegexMatches(
    candidates,
    content,
    "rule_clm_02",
    /\b\d{1,3}(?:\.\d+)?%\s+(?:reduction|improvement|increase)\b[^.!?\n]{0,55}|\breduce\s+[^.!?\n]{0,32}\bby\s+\d{1,3}%/gi,
    () => ({
      title: "Unapproved efficacy statistic",
      explanation:
        "This percentage is not in the approved product fact sheet. Use the cleared study wording and keep the study ID attached to the claim.",
      fix:
        "support smoother-looking skin, as shown in Study AUR-2025-014",
      confidence: 0.9,
    }),
    1,
  );

  // DSC-01 — missing paid-partnership disclosure.
  const hasDisclosure = /#ad\b|paid partnership|sponsored\b|advertisement\b/i.test(
    content,
  );
  if (submission.isPaidPartnership && !hasDisclosure) {
    const firstPhrase =
      content.split(/[.!?\n—]/)[0]?.trim().slice(0, 52) ?? content.slice(0, 52);
    if (firstPhrase) {
      addCandidate(
        candidates,
        content,
        "rule_dsc_01",
        firstPhrase,
        "This content is marked as a paid partnership but no disclosure appears at the start. The Social Media Playbook requires #ad in the first 125 characters, not only in platform settings.",
        `#ad · ${firstPhrase}`,
        { confidence: 0.99, title: "Missing paid-partnership disclosure" },
      );
    }
  }

  // DSC-02 — offers without complete terms.
  addRegexMatches(
    candidates,
    content,
    "rule_dsc_02",
    /\bfree\s+(?:standard\s+)?shipping\b[^.!?\n]{0,60}|\b(?:money[- ]back|risk[- ]free)\b[^.!?\n]{0,55}|\b\d{1,2}%\s+off\b[^.!?\n]{0,72}/gi,
    (evidence) => {
      let fix = "Offer ends 30 Nov 2026. T&Cs apply.";
      const hasDiscount = /\d{1,2}%\s*off/i.test(evidence);
      const hasShipping = /free\s+shipping/i.test(evidence);
      if (hasDiscount && hasShipping) {
        fix =
          "25% off the entire Ritual collection and free shipping on orders over ₹999 (T&Cs apply; ends 30 Nov 2026)";
      } else if (hasShipping) {
        fix = `${evidence.replace(/on every order/i, "on orders over ₹999")} (T&Cs apply; ends 30 Nov 2026)`;
      } else if (hasDiscount) {
        fix = /forever/i.test(evidence)
          ? "50% off your first Winter Glow order (T&Cs apply; ends 30 Nov 2026)"
          : `${evidence.split(/\s+and\s+/i)[0]} (T&Cs apply; ends 30 Nov 2026)`;
      } else {
        fix = `${evidence} (T&Cs apply; valid within 30 days)`;
      }
      return {
        title: "Incomplete offer terms",
        explanation:
          "The offer is missing eligibility or exclusions. Discounts and shipping incentives must be understandable without leaving the post, with a clear end date.",
        fix,
        confidence: 0.87,
      };
    },
    1,
  );

  // TRM-01 — vague safety terminology.
  addRegexMatches(
    candidates,
    content,
    "rule_trm_01",
    /\b(?:chemical[- ]free|non[- ]toxic|toxin[- ]free|clean\s+beauty)\b/gi,
    () => ({
      title: "Vague safety terminology",
      explanation:
        "'Chemical-free' and similar phrases imply a safety standard the brand cannot substantiate. The approved alternative names what the formula does not contain.",
      fix: "formulated without parabens, sulfates or mineral oil",
      confidence: 0.9,
    }),
    1,
  );

  // TON-01 — fear or shame.
  addRegexMatches(
    candidates,
    content,
    "rule_ton_01",
    /\b(?:don'?t let|stop letting|embarrassing|anti[- ]aging|flaws?|imperfections?)\b[^.!?\n]{0,60}|\b(?:your\s+)?skin\s+is\s+damaged\b[^.!?\n]{0,45}|\btired,?\s+dull\s+skin\b[^.!?\n]{0,45}/gi,
    (evidence) => ({
      title: "Fear-based appearance language",
      explanation:
        "The wording frames skin as a flaw to fix, which conflicts with Aurelia's warm, non-shaming voice. Focus on the care experience or a visible improvement.",
      fix: /damaged/i.test(evidence)
        ? "Support your skin with a gentle, comforting daily ritual"
        : /tired|dull/i.test(evidence)
          ? "Give your skin a fresh, healthy-looking glow"
          : "A gentle step for skin that feels comfortable",
      confidence: 0.88,
    }),
    2,
  );

  // TON-02 — jargon.
  addRegexMatches(
    candidates,
    content,
    "rule_ton_02",
    /\b(?:acid mantle|microbiome|biohacking|synergistic|exosome|peptide complex)\b/gi,
    () => ({
      title: "Technical jargon",
      explanation:
        "This term is not explained and may not be familiar to a broad audience. Use everyday language, or add a short plain-language definition.",
      fix: "the skin's natural moisture barrier",
      confidence: 0.82,
    }),
    1,
  );

  // REG-01 — competitor disparagement or misleading professional framing.
  addRegexMatches(
    candidates,
    content,
    "rule_reg_01",
    /\b(?:unlike\s+(?:other|most)\s+brands?|better\s+than\s+[^.!?\n]{1,30}|other\s+brands?\s+can'?t)\b[^.!?\n]{0,50}|\bdermatologists?\s+(?:hate|fear)\b[^.!?\n]{0,50}/gi,
    () => ({
      title: "Misleading comparative framing",
      explanation:
        "The copy implies a comparison or insider claim that cannot be supported with like-for-like evidence. Rewrite it as a positive statement about the product.",
      fix: "a daily ritual designed for comfortable, hydrated-feeling skin",
      confidence: 0.86,
    }),
    1,
  );

  // ACC-01 — accessibility.
  const emoji = [...content.matchAll(/\p{Extended_Pictographic}/gu)];
  if (emoji.length > 3) {
    const evidence = emoji.slice(0, 4).map((item) => item[0]).join("");
    const start = content.indexOf(evidence);
    if (start >= 0) {
      addCandidate(
        candidates,
        content,
        "rule_acc_01",
        evidence,
        `This draft uses ${emoji.length} emoji. More than three can make copy harder to parse with assistive technology.`,
        "Use up to three emoji and add descriptive alt text for the visual.",
        { confidence: 0.8, title: "Emoji-heavy social copy" },
      );
    }
  }

  return candidates;
}

function overlaps(a: Candidate, b: Candidate) {
  const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  if (overlap <= 0) return false;
  const shorter = Math.min(a.end - a.start, b.end - b.start);
  return overlap / Math.max(1, shorter) > 0.35;
}

function dedupeCandidates(candidates: Candidate[]) {
  const sorted = [...candidates].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return SEVERITY_WEIGHTS[b.severity ?? "medium"] - SEVERITY_WEIGHTS[a.severity ?? "medium"];
  });
  const kept: Candidate[] = [];
  for (const candidate of sorted) {
    if (
      kept.some(
        (existing) =>
          existing.evidence.toLowerCase() === candidate.evidence.toLowerCase() ||
          overlaps(existing, candidate),
      )
    ) {
      continue;
    }
    kept.push(candidate);
  }
  return kept.slice(0, 8);
}

function detectKnowledgeGaps(
  submission: ReviewSubmission,
  prefix: string,
): KnowledgeGap[] {
  const content = submission.content;
  const gaps: KnowledgeGap[] = [];

  const safetyContext = /safe|sensitive|all skin|every skin|pregnan|eczema/i.test(
    content,
  );
  if (/\bbakuchiol\b/i.test(content) && safetyContext) {
    const evidence = content.match(/\bbakuchiol\b/i)?.[0] ?? "bakuchiol";
    const start = content.toLowerCase().indexOf(evidence.toLowerCase());
    gaps.push({
      id: `${prefix}_gap_bakuchiol`,
      topic: "Bakuchiol safety across all skin types",
      evidence,
      start,
      end: start + evidence.length,
      explanation:
        "Approved facts confirm 0.5% bakuchiol in the formula, but the library contains no evidence that it is safe for every skin type, including sensitive or pregnancy-related use.",
      recommendation:
        "Do not infer broad safety from ingredient concentration. Ask the product team for approved safety guidance, or remove the blanket suitability claim.",
      confidence: 0.78,
    });
  }

  if (/\bmicrobiome\b/i.test(content)) {
    const evidence = content.match(/\bmicrobiome\b/i)?.[0] ?? "microbiome";
    const start = content.toLowerCase().indexOf(evidence.toLowerCase());
    gaps.push({
      id: `${prefix}_gap_microbiome`,
      topic: "Microbiome benefit claim",
      evidence,
      start,
      end: start + evidence.length,
      explanation:
        "The approved knowledge base has no support for a microbiome-related benefit. The wording cannot be verified against a source.",
      recommendation:
        "Escalate to the product science team. Until evidence is approved, describe only the sensory or hydration experience.",
      confidence: 0.74,
    });
  }

  return gaps;
}

export function analyzeContent(
  submission: ReviewSubmission,
  prefix: string,
): AnalysisResult {
  const candidates = dedupeCandidates(detectFindings(submission));
  const findings: Finding[] = candidates.map((candidate) => {
    const rule = ruleFor(candidate.ruleId);
    return {
      id: `${prefix}_${rule.code.toLowerCase()}_${candidate.start}`,
      ruleId: rule.id,
      ruleCode: rule.code,
      title: candidate.title ?? rule.title,
      category: rule.category as FindingCategory,
      severity: candidate.severity ?? rule.defaultSeverity,
      status: "open",
      evidence: candidate.evidence,
      start: candidate.start,
      end: candidate.end,
      explanation: candidate.explanation,
      suggestedFix: candidate.suggestedFix,
      confidence: candidate.confidence,
      source: buildSource(rule),
    };
  });

  const knowledgeGaps = detectKnowledgeGaps(submission, prefix);
  const score = Math.max(
    0,
    100 -
      findings.reduce(
        (total, finding) => total + SEVERITY_WEIGHTS[finding.severity],
        0,
      ),
  );

  const critical = findings.filter((finding) => finding.severity === "critical").length;
  const high = findings.filter((finding) => finding.severity === "high").length;
  const categories = [...new Set(findings.map((finding) => finding.category))];
  const summary =
    findings.length === 0
      ? "No policy issues were detected in this version. A human reviewer should still confirm context, visuals and channel requirements before approval."
      : `${findings.length} ${findings.length === 1 ? "finding" : "findings"} across ${categories.join(", ")}. ${critical > 0 ? `${critical} critical ${critical === 1 ? "issue" : "issues"} and ${high} high-severity ${high === 1 ? "issue" : "issues"} should be resolved before approval.` : high > 0 ? `${high} high-severity ${high === 1 ? "issue requires" : "issues require"} review before approval.` : "No critical blockers were detected."} ${knowledgeGaps.length > 0 ? `${knowledgeGaps.length} knowledge ${knowledgeGaps.length === 1 ? "gap needs" : "gaps need"} human verification.` : ""} Findings are advisory, not a legal verdict.`;

  return { findings, knowledgeGaps, summary: summary.trim(), score };
}

export function policyRuleCount() {
  return policyRules.length;
}
