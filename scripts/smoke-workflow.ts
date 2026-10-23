import { MockReviewService } from "../src/lib/services/mock-review-service";

let failures = 0;

function check(condition: unknown, message: string) {
  if (condition) {
    console.log(`PASS  ${message}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${message}`);
  }
}

async function expectError(action: () => Promise<unknown>, message: string) {
  try {
    await action();
    check(false, message);
  } catch {
    check(true, message);
  }
}

async function main() {
  const service = new MockReviewService();

  const seeded = await service.listReviews();
  check(seeded.length === 6, "six seeded reviews load");

  const glow = await service.getReview("rev_glow_launch");
  check(Boolean(glow), "glow launch review can be fetched");
  if (!glow) return;

  const initialScore = glow.score;
  const initialVersions = glow.versions.length;
  const firstOpen = glow.findings.find((finding) => finding.status === "open");
  check(Boolean(firstOpen), "glow review has an open finding");
  if (!firstOpen) return;

  const accepted = await service.updateFinding(
    glow.id,
    firstOpen.id,
    "accept",
  );
  const resolved = accepted.findings.find(
    (finding) => finding.id === firstOpen.id,
  );
  check(resolved?.status === "accepted", "accepting a fix resolves the finding");
  check(accepted.score > initialScore, "accepting a fix raises the advisory score");
  check(
    accepted.versions.length === initialVersions + 1,
    "accepting a fix creates a new version",
  );
  check(
    accepted.content.includes(firstOpen.suggestedFix),
    "accepted replacement is written into the content",
  );

  const commented = await service.addComment(
    glow.id,
    "Test comment from the workflow smoke check.",
  );
  check(
    commented.comments.some(
      (comment) => comment.body === "Test comment from the workflow smoke check.",
    ),
    "reviewer comments are persisted",
  );

  const requested = await service.requestChanges(
    glow.id,
    "Please tighten the remaining claims before the launch.",
  );
  check(
    requested.status === "changes_requested",
    "requesting changes updates the status",
  );
  check(
    requested.comments.some((comment) => comment.type === "decision"),
    "requesting changes records a decision comment",
  );

  const revised = await service.simulateCreatorRevision(glow.id);
  check(
    revised.status === "in_review",
    "creator revision returns the review to in review",
  );
  check(
    revised.findings.every((finding) => finding.status !== "open"),
    "creator revision resolves all suggested fixes",
  );
  check(
    revised.versions.length > requested.versions.length,
    "creator revision adds a version snapshot",
  );

  const approved = await service.approveReview(
    glow.id,
    "All findings resolved and evidence checked in the smoke test.",
  );
  check(approved.status === "approved", "approval records the approved status");
  check(
    approved.decision?.action === "approved",
    "approval stores a named decision",
  );

  await expectError(
    () => service.updateFinding(glow.id, firstOpen.id, "accept"),
    "decided reviews lock their findings",
  );

  await expectError(
    () =>
      service.createReview({
        title: "Too short",
        channel: "Instagram",
        content: "Not enough copy.",
        isPaidPartnership: false,
      }),
    "short submissions are rejected",
  );

  const risky = await service.createReview({
    title: "Smoke test risky draft",
    channel: "Instagram",
    content:
      "This serum cures acne in 7 days and is 100% chemical-free. Shop the launch now with free shipping on every order.",
    isPaidPartnership: true,
  });
  check(risky.findings.length > 0, "risky content produces findings");
  check(
    risky.findings.some((finding) => finding.severity === "critical"),
    "risky content includes a critical finding",
  );
  check(
    risky.knowledgeGaps.length === 0,
    "new risky draft has no unsupported-term knowledge gap",
  );

  const clean = await service.createReview({
    title: "Smoke test clean draft",
    channel: "LinkedIn",
    content:
      "Barrier Repair Moisturiser is back in stock. Formulated with ceramides and squalane, it helps support the skin's natural moisture barrier. In a 12-week consumer study, 91% agreed their skin felt more hydrated (Study AUR-2025-021). #ad",
    isPaidPartnership: true,
  });
  check(clean.findings.length === 0, "pre-cleared copy returns no findings");
  check(clean.score === 100, "pre-cleared copy scores 100");

  const autumn = await service.getReview("rev_autumn_email");
  check(Boolean(autumn), "autumn review can be fetched for edit coverage");
  if (!autumn) return;
  const editTarget = autumn.findings.find((finding) => finding.status === "open");
  check(Boolean(editTarget), "autumn review has an editable finding");
  if (!editTarget) return;
  const customReplacement = "A deliberately custom replacement from the smoke test.";
  const edited = await service.updateFinding(
    autumn.id,
    editTarget.id,
    "edit",
    { replacement: customReplacement },
  );
  check(
    edited.content.includes(customReplacement),
    "custom edits are written into the content",
  );
  const dismissTarget = edited.findings.find(
    (finding) => finding.status === "open",
  );
  check(Boolean(dismissTarget), "autumn review has a second open finding");
  if (!dismissTarget) return;
  const dismissed = await service.updateFinding(
    edited.id,
    dismissTarget.id,
    "dismiss",
    { reason: "Approved brand exception" },
  );
  check(
    dismissed.findings.find((finding) => finding.id === dismissTarget.id)
      ?.status === "dismissed",
    "dismissals are recorded with a reason",
  );

  const reset = await service.resetDemo();
  check(reset.length === 6, "reset restores the six seeded reviews");
  check(
    reset.some(
      (review) =>
        review.id === "rev_glow_launch" &&
        review.status === "in_review" &&
        review.versions.length === 2,
    ),
    "reset restores the original glow launch state",
  );

  if (failures > 0) {
    console.error(`\n${failures} workflow check(s) failed.`);
    process.exitCode = 1;
    return;
  }
  console.log("\nAll workflow smoke checks passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
