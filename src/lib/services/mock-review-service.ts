import { computeScore, DEMO_USER } from "@/lib/review-config";
import { analyzeContent } from "@/lib/mock/review-engine";
import { createSeedReviews } from "@/lib/mock/seed-reviews";
import type {
  ActivityEvent,
  FindingAction,
  Review,
  ReviewComment,
  ReviewService,
  ReviewSubmission,
  ReviewVersion,
} from "@/lib/types";

const STORAGE_KEY = "brandlens.demo.reviews.v1";
const STORAGE_SCHEMA = 1;

type StoredPayload = {
  schema: number;
  reviews: Review[];
};

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newId(prefix: string) {
  const rand =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function nearestOccurrence(content: string, evidence: string, target: number) {
  if (!evidence) return -1;
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let index = content.indexOf(evidence);
  while (index !== -1) {
    const distance = Math.abs(index - target);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
    index = content.indexOf(evidence, index + 1);
  }
  return best;
}

function repositionGaps(review: Review) {
  review.knowledgeGaps = review.knowledgeGaps.map((gap) => {
    const index = review.content
      .toLowerCase()
      .indexOf(gap.evidence.toLowerCase());
    if (index === -1) return gap;
    return { ...gap, start: index, end: index + gap.evidence.length };
  });
}

function refreshDerived(review: Review) {
  review.score = computeScore(review.findings);
  const open = review.findings.filter((finding) => finding.status === "open");
  const gaps = review.knowledgeGaps.length;

  if (open.length === 0) {
    review.summary = gaps
      ? `No open findings remain for this version. ${gaps} knowledge ${gaps === 1 ? "gap still needs" : "gaps still need"} human verification before publication.`
      : "No open findings remain for this version. The content is ready for a final human decision.";
    return;
  }

  const critical = open.filter((finding) => finding.severity === "critical").length;
  const high = open.filter((finding) => finding.severity === "high").length;
  const categories = [...new Set(open.map((finding) => finding.category))];
  const blockerText =
    critical > 0
      ? `${critical} critical ${critical === 1 ? "finding remains" : "findings remain"} before approval.`
      : high > 0
        ? `${high} high-severity ${high === 1 ? "finding needs" : "findings need"} reviewer judgement.`
        : "No critical blockers remain.";

  review.summary = `${open.length} open ${open.length === 1 ? "finding" : "findings"} across ${categories.join(", ")}. ${blockerText}${gaps > 0 ? ` ${gaps} knowledge ${gaps === 1 ? "gap needs" : "gaps need"} human verification.` : ""} Findings are advisory, not a legal verdict.`;
}

function makeComment(
  author: string,
  role: string,
  body: string,
  type: ReviewComment["type"] = "comment",
): ReviewComment {
  return {
    id: newId("comment"),
    author,
    role,
    body,
    createdAt: new Date().toISOString(),
    type,
  };
}

function makeActivity(
  type: ActivityEvent["type"],
  message: string,
  actor = DEMO_USER.name,
): ActivityEvent {
  return {
    id: newId("activity"),
    type,
    message,
    actor,
    at: new Date().toISOString(),
  };
}

function nextVersionNumber(versions: ReviewVersion[]) {
  return versions.reduce((max, version) => Math.max(max, version.number), 0) + 1;
}

class MockReviewService implements ReviewService {
  readonly mode = "mock" as const;
  private cache: Review[] | null = null;

  private ensure(): Review[] {
    if (this.cache) return this.cache;

    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as StoredPayload;
          if (
            parsed.schema === STORAGE_SCHEMA &&
            Array.isArray(parsed.reviews) &&
            parsed.reviews.length > 0
          ) {
            this.cache = parsed.reviews;
            return this.cache;
          }
        }
      } catch {
        // Corrupt demo storage should never break the walkthrough.
      }
    }

    const seeded = createSeedReviews();
    this.cache = seeded;
    this.persist(seeded);
    return seeded;
  }

  private persist(reviews: Review[]) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ schema: STORAGE_SCHEMA, reviews } satisfies StoredPayload),
      );
    } catch {
      // Storage can be blocked in private browsing; the in-memory cache still works.
    }
  }

  private async mutate(
    reviewId: string,
    updater: (review: Review) => void,
    latency = 420,
  ): Promise<Review> {
    await wait(latency);
    const reviews = this.ensure();
    const index = reviews.findIndex((review) => review.id === reviewId);
    if (index === -1) throw new Error("This review could not be found.");
    const review = clone(reviews[index]);
    updater(review);
    review.updatedAt = new Date().toISOString();
    refreshDerived(review);
    reviews[index] = review;
    this.persist(reviews);
    return clone(review);
  }

  async listReviews(): Promise<Review[]> {
    await wait(420);
    return clone(this.ensure()).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async getReview(id: string): Promise<Review | null> {
    await wait(180);
    const review = this.ensure().find((item) => item.id === id);
    return review ? clone(review) : null;
  }

  async createReview(input: ReviewSubmission): Promise<Review> {
    const title = input.title.trim();
    const content = input.content.trim();
    if (title.length < 3) throw new Error("Add a title for this review.");
    if (content.length < 40) {
      throw new Error("Add at least 40 characters of content to review.");
    }

    await wait(1900);

    const now = new Date().toISOString();
    const id = newId("rev");
    const analysis = analyzeContent(
      {
        title,
        channel: input.channel,
        content,
        isPaidPartnership: input.isPaidPartnership,
      },
      id,
    );
    const openFindings = analysis.findings.length;

    const review: Review = {
      id,
      title,
      channel: input.channel,
      status: "in_review",
      content,
      submittedBy: input.submittedBy ?? "Arjun Rao",
      submittedRole: "Content Creator",
      submittedAt: now,
      updatedAt: now,
      assignedTo: DEMO_USER.name,
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      isPaidPartnership: input.isPaidPartnership,
      score: analysis.score,
      summary: analysis.summary,
      findings: analysis.findings,
      knowledgeGaps: analysis.knowledgeGaps,
      versions: [
        {
          id: newId("version"),
          number: 1,
          content,
          createdAt: now,
          author: input.submittedBy ?? "Arjun Rao",
          note: input.sourceFileName
            ? `Initial submission from ${input.sourceFileName}.`
            : "Initial submission.",
          source: "submission",
          openFindings,
        },
      ],
      comments: [],
      activity: [
        makeActivity(
          "submitted",
          "Submitted version 1 for compliance review.",
          input.submittedBy ?? "Arjun Rao",
        ),
        makeActivity(
          "analysis",
          `Local mock analysis completed with ${openFindings} ${openFindings === 1 ? "finding" : "findings"}.`,
          "BrandLens engine",
        ),
      ],
      sourceFileName: input.sourceFileName,
    };

    const reviews = this.ensure();
    reviews.unshift(review);
    this.persist(reviews);
    return clone(review);
  }

  async updateFinding(
    reviewId: string,
    findingId: string,
    action: FindingAction,
    payload?: { replacement?: string; reason?: string },
  ): Promise<Review> {
    return this.mutate(
      reviewId,
      (review) => {
        if (review.status === "approved" || review.status === "rejected") {
          throw new Error(
            "This review is already decided. Findings are locked for audit.",
          );
        }
        const finding = review.findings.find((item) => item.id === findingId);
        if (!finding) throw new Error("This finding could not be found.");
        if (finding.status !== "open") {
          throw new Error("This finding has already been reviewed.");
        }

        if (action === "dismiss") {
          finding.status = "dismissed";
          finding.resolution = {
            action: "dismissed",
            by: DEMO_USER.name,
            at: new Date().toISOString(),
            note: payload?.reason?.trim() || "Reviewed and marked as not applicable.",
          };
          review.activity.unshift(
            makeActivity(
              "finding",
              `Dismissed ${finding.ruleCode} after human review.`,
            ),
          );
          return;
        }

        const replacement =
          action === "accept"
            ? finding.suggestedFix.trim()
            : payload?.replacement?.trim() ?? "";
        if (!replacement) throw new Error("Add a replacement before applying the edit.");
        if (replacement.length > 600) {
          throw new Error("Keep the replacement under 600 characters.");
        }
        if (replacement === finding.evidence) {
          throw new Error("The replacement is identical to the highlighted text.");
        }

        let start = finding.start;
        let end = finding.end;
        if (review.content.slice(start, end) !== finding.evidence) {
          const found = nearestOccurrence(
            review.content,
            finding.evidence,
            finding.start,
          );
          if (found === -1) {
            throw new Error(
              "The highlighted text has moved. Refresh the review and try again.",
            );
          }
          start = found;
          end = found + finding.evidence.length;
        }

        const before = review.content.slice(0, start);
        const after = review.content.slice(end);
        const nextContent = `${before}${replacement}${after}`;
        const delta = replacement.length - (end - start);

        finding.status = action === "accept" ? "accepted" : "edited";
        finding.start = start;
        finding.end = start + replacement.length;
        finding.resolution = {
          action: finding.status,
          by: DEMO_USER.name,
          at: new Date().toISOString(),
          note:
            action === "edit"
              ? "Reviewer applied a custom replacement."
              : "Reviewer accepted the suggested replacement.",
        };

        review.findings = review.findings.map((other) => {
          if (other.id === finding.id) return other;
          if (other.status !== "open") return other;
          if (other.start >= end) {
            return {
              ...other,
              start: other.start + delta,
              end: other.end + delta,
            };
          }
          if (other.end <= start) return other;
          const found = nearestOccurrence(nextContent, other.evidence, other.start);
          return found === -1
            ? other
            : { ...other, start: found, end: found + other.evidence.length };
        });

        review.content = nextContent;
        repositionGaps(review);

        const openAfter = review.findings.filter(
          (item) => item.status === "open",
        ).length;
        review.versions.push({
          id: newId("version"),
          number: nextVersionNumber(review.versions),
          content: nextContent,
          createdAt: new Date().toISOString(),
          author: DEMO_USER.name,
          note:
            action === "accept"
              ? `Applied the suggested fix for ${finding.ruleCode}.`
              : `Applied a reviewer edit for ${finding.ruleCode}.`,
          source: "edit",
          openFindings: openAfter,
        });

        review.activity.unshift(
          makeActivity(
            "finding",
            action === "accept"
              ? `Accepted the suggested fix for ${finding.ruleCode}.`
              : `Applied a custom edit for ${finding.ruleCode}.`,
          ),
        );
      },
      460,
    );
  }

  async addComment(reviewId: string, body: string): Promise<Review> {
    const trimmed = body.trim();
    if (trimmed.length < 2) throw new Error("Write a comment before posting.");
    if (trimmed.length > 2000) {
      throw new Error("Keep comments under 2,000 characters.");
    }
    return this.mutate(
      reviewId,
      (review) => {
        review.comments.push(
          makeComment(DEMO_USER.name, DEMO_USER.role, trimmed),
        );
        review.activity.unshift(
          makeActivity("comment", "Added a reviewer comment."),
        );
      },
      320,
    );
  }

  async requestChanges(reviewId: string, note: string): Promise<Review> {
    const trimmed = note.trim();
    if (trimmed.length < 8) {
      throw new Error("Explain what the creator needs to change.");
    }
    return this.mutate(
      reviewId,
      (review) => {
        if (review.status === "approved" || review.status === "rejected") {
          throw new Error("This review is already decided.");
        }
        review.status = "changes_requested";
        review.decision = undefined;
        review.comments.push(
          makeComment(DEMO_USER.name, DEMO_USER.role, trimmed, "decision"),
        );
        review.activity.unshift(
          makeActivity("decision", "Requested changes from the creator."),
        );
      },
      520,
    );
  }

  async approveReview(reviewId: string, note: string): Promise<Review> {
    const trimmed = note.trim();
    if (trimmed.length < 10) {
      throw new Error("Add an approval note of at least 10 characters.");
    }
    return this.mutate(
      reviewId,
      (review) => {
        if (review.status === "approved" || review.status === "rejected") {
          throw new Error("This review is already decided.");
        }
        const criticalOpen = review.findings.filter(
          (finding) =>
            finding.status === "open" && finding.severity === "critical",
        ).length;
        if (criticalOpen > 0) {
          throw new Error(
            "Resolve every critical finding before approving this content.",
          );
        }
        const now = new Date().toISOString();
        review.status = "approved";
        review.decision = {
          action: "approved",
          by: DEMO_USER.name,
          at: now,
          note: trimmed,
        };
        review.comments.push(
          makeComment(
            DEMO_USER.name,
            DEMO_USER.role,
            `Approved this version. ${trimmed}`,
            "decision",
          ),
        );
        review.activity.unshift(
          makeActivity("decision", "Approved the content for publication."),
        );
      },
      650,
    );
  }

  async rejectReview(reviewId: string, reason: string): Promise<Review> {
    const trimmed = reason.trim();
    if (trimmed.length < 8) {
      throw new Error("Explain why this content cannot be published.");
    }
    return this.mutate(
      reviewId,
      (review) => {
        if (review.status === "approved" || review.status === "rejected") {
          throw new Error("This review is already decided.");
        }
        const now = new Date().toISOString();
        review.status = "rejected";
        review.decision = {
          action: "rejected",
          by: DEMO_USER.name,
          at: now,
          note: trimmed,
        };
        review.comments.push(
          makeComment(
            DEMO_USER.name,
            DEMO_USER.role,
            `Rejected this content. ${trimmed}`,
            "decision",
          ),
        );
        review.activity.unshift(
          makeActivity("decision", "Rejected the content for publication."),
        );
      },
      550,
    );
  }

  async simulateCreatorRevision(reviewId: string): Promise<Review> {
    return this.mutate(
      reviewId,
      (review) => {
        if (review.status === "approved" || review.status === "rejected") {
          throw new Error("This review is already decided.");
        }
        const open = [...review.findings]
          .filter((finding) => finding.status === "open")
          .sort((a, b) => b.start - a.start);

        let nextContent = review.content;
        let applied = 0;
        const resolutionTime = new Date().toISOString();

        for (const finding of open) {
          const found = nearestOccurrence(nextContent, finding.evidence, finding.start);
          if (found === -1) continue;
          nextContent = `${nextContent.slice(0, found)}${finding.suggestedFix}${nextContent.slice(found + finding.evidence.length)}`;
          finding.status = "edited";
          finding.start = found;
          finding.end = found + finding.suggestedFix.length;
          finding.resolution = {
            action: "edited",
            by: "Arjun Rao",
            at: resolutionTime,
            note: "Applied in a simulated creator revision (demo helper).",
          };
          applied += 1;
        }

        if (applied === 0) {
          throw new Error("There are no suggested fixes left to apply.");
        }

        review.content = nextContent;
        repositionGaps(review);
        const openAfter = review.findings.filter(
          (finding) => finding.status === "open",
        ).length;
        review.versions.push({
          id: newId("version"),
          number: nextVersionNumber(review.versions),
          content: nextContent,
          createdAt: resolutionTime,
          author: "Arjun Rao",
          note: "Simulated creator revision: applied all suggested fixes. (Demo helper — no creator portal is connected.)",
          source: "creator_revision",
          openFindings: openAfter,
        });
        review.status = "in_review";
        review.decision = undefined;
        review.comments.push(
          makeComment(
            "Arjun Rao",
            "Content Creator",
            "Creator revision: I've applied the suggested fixes and resubmitted this version for review.",
          ),
        );
        review.activity.unshift(
          makeActivity(
            "version",
            `Creator revision uploaded with ${applied} suggested ${applied === 1 ? "fix" : "fixes"} applied (simulated).`,
            "Arjun Rao",
          ),
        );
      },
      900,
    );
  }

  async resetDemo(): Promise<Review[]> {
    await wait(400);
    const seeded = createSeedReviews();
    this.cache = seeded;
    this.persist(seeded);
    return clone(seeded).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }
}

export { MockReviewService };
