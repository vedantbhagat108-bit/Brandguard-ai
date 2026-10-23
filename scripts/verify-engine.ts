import { createSeedReviews } from "../src/lib/mock/seed-reviews";
import { analyzeContent } from "../src/lib/mock/review-engine";

const reviews = createSeedReviews();

for (const review of reviews) {
  console.log(
    `\n${review.title} [${review.status}] score=${review.score} findings=${review.findings.length} gaps=${review.knowledgeGaps.length}`,
  );
  for (const finding of review.findings) {
    console.log(
      `  ${finding.severity.toUpperCase().padEnd(8)} ${finding.ruleCode} "${finding.evidence}" -> "${finding.suggestedFix}"`,
    );
  }
  for (const gap of review.knowledgeGaps) {
    console.log(`  GAP ${gap.topic} @${gap.start}-${gap.end}`);
  }
}

const clean = analyzeContent(
  {
    title: "Clean test",
    channel: "LinkedIn",
    isPaidPartnership: true,
    content:
      "Barrier Repair Moisturiser is back in stock. Formulated with ceramides and squalane, it helps support the skin's natural moisture barrier. In a 12-week consumer study, 91% agreed their skin felt more hydrated (Study AUR-2025-021). #ad",
  },
  "test_clean",
);
console.log(`\nClean test findings=${clean.findings.length} score=${clean.score}`);
