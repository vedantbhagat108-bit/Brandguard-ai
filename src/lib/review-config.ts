import type {
  DemoUser,
  Finding,
  FindingCategory,
  Review,
  ReviewStatus,
  Severity,
} from "@/lib/types";

export const DEMO_USER: DemoUser = {
  name: "Manya Iyer",
  role: "Brand & Compliance Lead",
  initials: "MI",
};

export const CREATOR_PROFILE = {
  name: "Arjun Rao",
  role: "Content Creator",
  initials: "AR",
};

export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 12,
  high: 8,
  medium: 4,
  low: 2,
};

export const SEVERITY_META: Record<
  Severity,
  {
    label: string;
    order: number;
    badge: string;
    dot: string;
    highlight: string;
    highlightSelected: string;
    softBg: string;
    text: string;
    border: string;
  }
> = {
  critical: {
    label: "Critical",
    order: 0,
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
    highlight:
      "bg-rose-100/90 decoration-rose-400 hover:bg-rose-200/90",
    highlightSelected: "ring-2 ring-rose-500 ring-offset-2",
    softBg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
  high: {
    label: "High",
    order: 1,
    badge: "border-orange-200 bg-orange-50 text-orange-700",
    dot: "bg-orange-500",
    highlight:
      "bg-orange-100/90 decoration-orange-400 hover:bg-orange-200/90",
    highlightSelected: "ring-2 ring-orange-500 ring-offset-2",
    softBg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
  },
  medium: {
    label: "Medium",
    order: 2,
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    highlight:
      "bg-amber-100/90 decoration-amber-400 hover:bg-amber-200/90",
    highlightSelected: "ring-2 ring-amber-500 ring-offset-2",
    softBg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
  },
  low: {
    label: "Low",
    order: 3,
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
    highlight:
      "bg-sky-100/90 decoration-sky-400 hover:bg-sky-200/90",
    highlightSelected: "ring-2 ring-sky-500 ring-offset-2",
    softBg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200",
  },
};

export const STATUS_META: Record<
  ReviewStatus,
  {
    label: string;
    shortLabel: string;
    description: string;
    badge: string;
    dot: string;
    accent: string;
  }
> = {
  in_review: {
    label: "In review",
    shortLabel: "In review",
    description: "Findings are ready for a reviewer decision.",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
    dot: "bg-indigo-500",
    accent: "bg-indigo-500",
  },
  changes_requested: {
    label: "Changes requested",
    shortLabel: "Changes",
    description: "Waiting for the creator to revise and resubmit.",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    accent: "bg-amber-500",
  },
  approved: {
    label: "Approved",
    shortLabel: "Approved",
    description: "A named reviewer approved this version for publication.",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
    accent: "bg-emerald-500",
  },
  rejected: {
    label: "Rejected",
    shortLabel: "Rejected",
    description: "This content must not be published in its current form.",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
    accent: "bg-rose-500",
  },
};

export const CATEGORY_META: Record<
  FindingCategory,
  { label: FindingCategory; description: string; icon: string }
> = {
  Claims: {
    label: "Claims",
    description: "Medical, efficacy and substantiation claims",
    icon: "flask",
  },
  Disclosure: {
    label: "Disclosure",
    description: "Paid partnerships, offers and required terms",
    icon: "megaphone",
  },
  Terminology: {
    label: "Terminology",
    description: "Approved product language and glossary",
    icon: "book",
  },
  Tone: {
    label: "Tone",
    description: "Warm, plain-spoken and non-shaming language",
    icon: "message",
  },
  Regulatory: {
    label: "Regulatory",
    description: "Comparative claims and consumer-protection rules",
    icon: "scale",
  },
  Accessibility: {
    label: "Accessibility",
    description: "Inclusive, readable and screen-reader-friendly copy",
    icon: "accessibility",
  },
};

export const REVIEW_FILTERS: Array<{
  value: ReviewStatus | "all";
  label: string;
}> = [
  { value: "all", label: "All reviews" },
  { value: "in_review", label: "In review" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export function unresolvedFindings(review: Review | Finding[]) {
  const findings = Array.isArray(review) ? review : review.findings;
  return findings.filter((finding) => finding.status === "open");
}

export function computeScore(findings: Finding[]) {
  const deduction = findings
    .filter((finding) => finding.status === "open")
    .reduce((total, finding) => total + SEVERITY_WEIGHTS[finding.severity], 0);
  return Math.max(0, Math.min(100, 100 - deduction));
}

export function countSeverity(findings: Finding[]) {
  return findings.reduce(
    (counts, finding) => {
      counts[finding.severity] += 1;
      if (finding.status === "open") counts.open += 1;
      return counts;
    },
    { critical: 0, high: 0, medium: 0, low: 0, open: 0 } as Record<
      Severity | "open",
      number
    >,
  );
}

export function openCriticalCount(review: Review) {
  return review.findings.filter(
    (finding) => finding.status === "open" && finding.severity === "critical",
  ).length;
}

export function approvalBlockers(review: Review) {
  const critical = review.findings.filter(
    (finding) => finding.status === "open" && finding.severity === "critical",
  ).length;
  const high = review.findings.filter(
    (finding) => finding.status === "open" && finding.severity === "high",
  ).length;

  const blockers: string[] = [];
  if (critical > 0) {
    blockers.push(
      `${critical} critical ${critical === 1 ? "finding is" : "findings are"} still unresolved.`,
    );
  }
  if (high > 0) {
    blockers.push(
      `${high} high-severity ${high === 1 ? "finding requires" : "findings require"} an explicit risk acknowledgement.`,
    );
  }
  return blockers;
}

export function scoreTone(score: number) {
  if (score >= 90) {
    return {
      label: "Strong",
      text: "text-emerald-600",
      bg: "bg-emerald-50",
      ring: "stroke-emerald-500",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (score >= 70) {
    return {
      label: "Needs review",
      text: "text-amber-600",
      bg: "bg-amber-50",
      ring: "stroke-amber-500",
      badge: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  return {
    label: "At risk",
    text: "text-rose-600",
    bg: "bg-rose-50",
    ring: "stroke-rose-500",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
  };
}

export function statusIsOpen(status: ReviewStatus) {
  return status === "in_review" || status === "changes_requested";
}

export function sortFindingsBySeverity(findings: Finding[]) {
  return [...findings].sort((a, b) => {
    const severityDiff =
      SEVERITY_META[a.severity].order - SEVERITY_META[b.severity].order;
    if (severityDiff !== 0) return severityDiff;
    return a.start - b.start;
  });
}

export function reviewOpenCount(reviews: Review[]) {
  return reviews.filter((review) => statusIsOpen(review.status)).length;
}
