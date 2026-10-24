import { computeScore, DEMO_USER } from '@/lib/review-config';
import { createSeedReviews } from '@/lib/mock/seed-reviews';
import type {
  ActivityEvent,
  Finding,
  FindingAction,
  KnowledgeGap,
  Review,
  ReviewComment,
  ReviewSubmission,
  ReviewVersion,
  Severity,
} from '@/lib/types';

function newId(prefix: string) {
  const rand =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
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
  const open = review.findings.filter((finding) => finding.status === 'open');
  const gaps = review.knowledgeGaps.length;

  if (open.length === 0) {
    review.summary = gaps
      ? `No open findings remain for this version. ${gaps} knowledge ${gaps === 1 ? 'gap still needs' : 'gaps still need'} human verification before publication.`
      : 'No open findings remain for this version. The content is ready for a final human decision.';
    return;
  }

  const critical = open.filter((finding) => finding.severity === 'critical').length;
  const high = open.filter((finding) => finding.severity === 'high').length;
  const categories = [...new Set(open.map((finding) => finding.category))];
  const blockerText =
    critical > 0
      ? `${critical} critical ${critical === 1 ? 'finding remains' : 'findings remain'} before approval.`
      : high > 0
        ? `${high} high-severity ${high === 1 ? 'finding needs' : 'findings need'} reviewer judgement.`
        : 'No critical blockers remain.';

  review.summary = `${open.length} open ${open.length === 1 ? 'finding' : 'findings'} across ${categories.join(', ')}. ${blockerText}${gaps > 0 ? ` ${gaps} knowledge ${gaps === 1 ? 'gap needs' : 'gaps need'} human verification.` : ''} Findings are advisory, not a legal verdict.`;
}

function nextVersionNumber(versions: ReviewVersion[]) {
  return versions.reduce((max, version) => Math.max(max, version.number), 0) + 1;
}

function sanitizeReviewState(review: Review): Review {
  if (review.status !== 'approved' && review.status !== 'rejected') {
    review.decision = undefined;
  }
  refreshDerived(review);
  return review;
}

import { securityDB } from './database.ts';

class BackendReviewStore {
  private reviews: Map<string, Review> = new Map();
  private initialized = false;

  private seedEcoFreshReviews(): Review[] {
    const now = new Date().toISOString();
    const miracleContent =
      'Our new herbal drops are a 100% guarantee cure for slow metabolism and will eliminate all digestive fatigue within 24 hours!';
    const springContent =
      'Embrace nature this spring with our cold-pressed herbal wellness infusion. Formulated with organic chamomile and peppermint to support your mindful daily routine. These statements have not been evaluated by the FDA. This product is not intended to diagnose, treat, cure, or prevent any disease.';

    return [
      {
        id: 'rev_ecofresh_miracle',
        title: 'EcoFresh — Miracle Metabolism Drops',
        channel: 'Product page',
        status: 'changes_requested',
        content: miracleContent,
        submittedBy: 'creator@ecofresh.com',
        submittedRole: 'Content Creator',
        submittedAt: now,
        updatedAt: now,
        assignedTo: 'reviewer@ecofresh.com',
        dueAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        isPaidPartnership: false,
        score: 24,
        summary:
          '2 open findings across Claims, Disclosure. 1 critical finding remains before approval. Severe policy violations: prohibited cure claims and missing FDA disclaimer.',
        findings: [
          {
            id: 'find_eco_1',
            ruleId: 'g0000001-0000-4000-8000-000000000001',
            ruleCode: 'ECO-LEGAL-01',
            title: 'Unsupported & Prohibited Medical Cure Claim',
            category: 'Claims',
            severity: 'critical',
            status: 'open',
            evidence: '100% guarantee cure for slow metabolism',
            start: miracleContent.indexOf('100% guarantee cure for slow metabolism'),
            end:
              miracleContent.indexOf('100% guarantee cure for slow metabolism') +
              '100% guarantee cure for slow metabolism'.length,
            explanation:
              'Prohibited medical cure claim violating FDA compliance and brand marketing rules.',
            suggestedFix: 'supports healthy natural digestive wellness',
            confidence: 0.98,
            source: {
              sourceId: 'g0000001-0000-4000-8000-000000000001',
              title: 'Therapeutic & Medical Claims Prohibition',
              section: 'legal_marketing_policy',
              quote:
                "EcoFresh products are natural dietary wellness supplements. Marketing content must NEVER claim that our products 'cure', 'treat', 'prevent', or offer a '100% guarantee' for any medical disease or physiological condition.",
              version: '1.0',
              approvedBy: 'admin@ecofresh.com',
              updatedAt: now,
            },
          },
          {
            id: 'find_eco_2',
            ruleId: 'g0000002-0000-4000-8000-000000000002',
            ruleCode: 'ECO-DISC-02',
            title: 'Missing Mandatory FDA Dietary Disclaimer',
            category: 'Disclosure',
            severity: 'high',
            status: 'open',
            evidence: 'eliminate all digestive fatigue within 24 hours!',
            start: miracleContent.indexOf('eliminate all digestive fatigue within 24 hours!'),
            end: miracleContent.length,
            explanation: 'Metabolism and digestive claims require the mandatory FDA disclaimer.',
            suggestedFix:
              'supports daily comfort. These statements have not been evaluated by the FDA. This product is not intended to diagnose, treat, cure, or prevent any disease.',
            confidence: 0.95,
            source: {
              sourceId: 'g0000002-0000-4000-8000-000000000002',
              title: 'Metabolism & Dietary FDA Disclaimer',
              section: 'disclaimers',
              quote:
                "Any promotional copy referencing metabolism, weight, or digestive health must include: 'These statements have not been evaluated by the FDA. This product is not intended to diagnose, treat, cure, or prevent any disease.'",
              version: '1.0',
              approvedBy: 'admin@ecofresh.com',
              updatedAt: now,
            },
          },
        ],
        knowledgeGaps: [],
        versions: [
          {
            id: 'ver_eco_1',
            number: 1,
            content: miracleContent,
            createdAt: now,
            author: 'creator@ecofresh.com',
            note: 'Initial submission from EcoFresh Botanicals workspace.',
            source: 'submission',
            openFindings: 2,
          },
        ],
        comments: [
          {
            id: 'comm_eco_1',
            author: 'reviewer@ecofresh.com',
            role: 'Reviewer',
            body: 'Severe policy violations: prohibited cure claims and missing FDA disclaimer.',
            createdAt: now,
            type: 'decision',
          },
        ],
        activity: [
          {
            id: 'act_eco_2',
            type: 'decision',
            message: 'Requested changes due to prohibited medical claim & missing FDA disclaimer.',
            actor: 'reviewer@ecofresh.com',
            at: now,
          },
          {
            id: 'act_eco_1',
            type: 'submitted',
            message: 'Submitted Miracle Metabolism Drops for EcoFresh governance review.',
            actor: 'creator@ecofresh.com',
            at: now,
          },
        ],
      },
      {
        id: 'rev_ecofresh_spring',
        title: 'EcoFresh — Spring Botanical Renewal',
        channel: 'Blog',
        status: 'approved',
        content: springContent,
        submittedBy: 'creator@ecofresh.com',
        submittedRole: 'Content Creator',
        submittedAt: now,
        updatedAt: now,
        assignedTo: 'reviewer@ecofresh.com',
        isPaidPartnership: false,
        score: 96,
        summary:
          'No open findings remain for this version. Fully compliant with brand tone and legal disclaimer requirements.',
        findings: [],
        knowledgeGaps: [],
        versions: [
          {
            id: 'ver_eco_spring_1',
            number: 1,
            content: springContent,
            createdAt: now,
            author: 'creator@ecofresh.com',
            note: 'Initial submission.',
            source: 'submission',
            openFindings: 0,
          },
        ],
        comments: [],
        activity: [
          {
            id: 'act_eco_spring_2',
            type: 'decision',
            message: 'Approved for publication (Score: 96/100).',
            actor: 'reviewer@ecofresh.com',
            at: now,
          },
          {
            id: 'act_eco_spring_1',
            type: 'submitted',
            message: 'Submitted Spring Botanical Renewal for review.',
            actor: 'creator@ecofresh.com',
            at: now,
          },
        ],
        decision: {
          action: 'approved',
          by: 'reviewer@ecofresh.com',
          at: now,
          note: 'Fully compliant with brand tone and legal disclaimer requirements.',
        },
      },
    ];
  }

  private init() {
    if (this.initialized) return;
    this.initialized = true;
    const ecoReviews = this.seedEcoFreshReviews();
    for (const r of ecoReviews) {
      this.reviews.set(r.id, r);
    }
    const seed = createSeedReviews();
    for (const r of seed) {
      this.reviews.set(r.id, r);
    }
  }

  list(): Review[] {
    this.init();
    return Array.from(this.reviews.values())
      .map((r) => clone(sanitizeReviewState(r)))
      .sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }

  get(id: string): Review | null {
    this.init();
    const r = this.reviews.get(id);
    return r ? clone(sanitizeReviewState(r)) : null;
  }

  save(review: Review): Review {
    this.init();
    sanitizeReviewState(review);
    review.updatedAt = new Date().toISOString();
    this.reviews.set(review.id, clone(review));
    securityDB.logAudit({
      brand_id: 'b0000001-0000-4000-8000-000000000001',
      user_id: null,
      action: 'CONTENT_SUBMITTED',
      details: {
        review_id: review.id,
        campaign: review.title,
        advisory_score: review.score,
        status: review.status,
      },
    });
    return clone(review);
  }

  updateFinding(
    reviewId: string,
    findingId: string,
    action: FindingAction,
    payload?: { replacement?: string; reason?: string }
  ): Review {
    this.init();
    const review = this.reviews.get(reviewId);
    if (!review) throw new Error(`Review ${reviewId} not found.`);

    if (review.status === 'approved' || review.status === 'rejected') {
      throw new Error('This review is already decided. Findings are locked for audit.');
    }

    const finding = review.findings.find((item) => item.id === findingId);
    if (!finding) throw new Error(`Finding ${findingId} not found.`);
    if (finding.status !== 'open') {
      throw new Error('This finding has already been reviewed.');
    }

    const now = new Date().toISOString();
    const by = DEMO_USER.name;

    if (action === 'dismiss') {
      finding.status = 'dismissed';
      finding.resolution = {
        action: 'dismissed',
        by,
        at: now,
        note: payload?.reason?.trim() || 'Reviewed and marked as not applicable.',
      };
      review.activity.unshift({
        id: newId('act'),
        type: 'finding',
        message: `Dismissed ${finding.ruleCode} after human review.`,
        actor: by,
        at: now,
      });
      refreshDerived(review);
      return this.save(review);
    }

    const replacement =
      action === 'accept'
        ? finding.suggestedFix.trim()
        : payload?.replacement?.trim() ?? '';
    if (!replacement) throw new Error('Add a replacement before applying the edit.');
    if (replacement.length > 600) {
      throw new Error('Keep the replacement under 600 characters.');
    }
    if (replacement === finding.evidence) {
      throw new Error('The replacement is identical to the highlighted text.');
    }

    let start = finding.start;
    let end = finding.end;
    if (review.content.slice(start, end) !== finding.evidence) {
      const found = nearestOccurrence(review.content, finding.evidence, finding.start);
      if (found === -1) {
        throw new Error('The highlighted text has moved. Refresh the review and try again.');
      }
      start = found;
      end = found + finding.evidence.length;
    }

    const before = review.content.slice(0, start);
    const after = review.content.slice(end);
    const nextContent = `${before}${replacement}${after}`;
    const delta = replacement.length - (end - start);

    finding.status = action === 'accept' ? 'accepted' : 'edited';
    finding.start = start;
    finding.end = start + replacement.length;
    finding.resolution = {
      action: finding.status,
      by,
      at: now,
      note:
        payload?.reason?.trim() ||
        (action === 'edit'
          ? 'Reviewer applied a custom replacement.'
          : 'Reviewer accepted the suggested replacement.'),
    };

    review.findings = review.findings.map((other) => {
      if (other.id === finding.id) return other;
      if (other.status !== 'open') return other;
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

    const openAfter = review.findings.filter((f) => f.status === 'open').length;
    review.versions.push({
      id: newId('version'),
      number: nextVersionNumber(review.versions),
      content: nextContent,
      createdAt: now,
      author: by,
      note:
        action === 'accept'
          ? `Applied the suggested fix for ${finding.ruleCode}.`
          : `Applied a reviewer edit for ${finding.ruleCode}.`,
      source: 'edit',
      openFindings: openAfter,
    });

    review.activity.unshift({
      id: newId('act'),
      type: 'finding',
      message:
        action === 'accept'
          ? `Accepted the suggested fix for ${finding.ruleCode}.`
          : `Applied a custom edit for ${finding.ruleCode}.`,
      actor: by,
      at: now,
    });

    refreshDerived(review);
    return this.save(review);
  }

  addComment(reviewId: string, body: string, author: string = DEMO_USER.name, role: string = DEMO_USER.role): Review {
    this.init();
    const review = this.reviews.get(reviewId);
    if (!review) throw new Error(`Review ${reviewId} not found.`);

    const text = body.trim();
    if (text.length < 2) throw new Error('Write a comment before posting.');
    if (text.length > 2000) throw new Error('Keep comments under 2,000 characters.');

    const now = new Date().toISOString();
    const comment: ReviewComment = {
      id: newId('comment'),
      author,
      role,
      body: text,
      createdAt: now,
      type: 'comment',
    };

    review.comments.push(comment);
    review.activity.unshift({
      id: newId('act'),
      type: 'comment',
      message: `Added a comment: "${text.slice(0, 60)}"`,
      actor: author,
      at: now,
    });

    return this.save(review);
  }

  applyDecision(
    reviewId: string,
    action: 'approved' | 'rejected' | 'changes_requested',
    note: string,
    by: string = DEMO_USER.name
  ): Review {
    this.init();
    const review = this.reviews.get(reviewId);
    if (!review) throw new Error(`Review ${reviewId} not found.`);

    if (review.status === 'approved' || review.status === 'rejected') {
      throw new Error('This review is already decided.');
    }

    const trimmed = (note ?? '').trim();
    const now = new Date().toISOString();

    if (action === 'changes_requested') {
      if (trimmed.length < 8) {
        throw new Error('Explain what the creator needs to change.');
      }
      review.status = 'changes_requested';
      review.decision = undefined;
      review.comments.push({
        id: newId('comment'),
        author: by,
        role: DEMO_USER.role,
        body: trimmed,
        createdAt: now,
        type: 'decision',
      });
      review.activity.unshift({
        id: newId('act'),
        type: 'decision',
        message: 'Requested changes from the creator.',
        actor: by,
        at: now,
      });
      refreshDerived(review);
      return this.save(review);
    }

    if (action === 'approved') {
      if (trimmed.length < 10) {
        throw new Error('Add an approval note of at least 10 characters.');
      }
      const criticalOpen = review.findings.filter(
        (finding) => finding.status === 'open' && finding.severity === 'critical'
      ).length;
      if (criticalOpen > 0) {
        throw new Error('Resolve every critical finding before approving this content.');
      }
      review.status = 'approved';
      review.decision = {
        action: 'approved',
        by,
        at: now,
        note: trimmed,
      };
      review.comments.push({
        id: newId('comment'),
        author: by,
        role: DEMO_USER.role,
        body: `Approved this version. ${trimmed}`,
        createdAt: now,
        type: 'decision',
      });
      review.activity.unshift({
        id: newId('act'),
        type: 'decision',
        message: 'Approved the content for publication.',
        actor: by,
        at: now,
      });
      refreshDerived(review);
      return this.save(review);
    }

    if (trimmed.length < 8) {
      throw new Error('Explain why this content cannot be published.');
    }
    review.status = 'rejected';
    review.decision = {
      action: 'rejected',
      by,
      at: now,
      note: trimmed,
    };
    review.comments.push({
      id: newId('comment'),
      author: by,
      role: DEMO_USER.role,
      body: `Rejected this content. ${trimmed}`,
      createdAt: now,
      type: 'decision',
    });
    review.activity.unshift({
      id: newId('act'),
      type: 'decision',
      message: 'Rejected the content for publication.',
      actor: by,
      at: now,
    });
    refreshDerived(review);
    return this.save(review);
  }

  simulateCreatorRevision(reviewId: string): Review {
    this.init();
    const review = this.reviews.get(reviewId);
    if (!review) throw new Error(`Review ${reviewId} not found.`);

    if (review.status === 'approved' || review.status === 'rejected') {
      throw new Error('This review is already decided.');
    }

    const open = [...review.findings]
      .filter((finding) => finding.status === 'open')
      .sort((a, b) => b.start - a.start);

    let nextContent = review.content;
    let applied = 0;
    const now = new Date().toISOString();
    const author = review.submittedBy || 'Arjun Rao';

    for (const finding of open) {
      const found = nearestOccurrence(nextContent, finding.evidence, finding.start);
      if (found === -1) continue;
      nextContent = `${nextContent.slice(0, found)}${finding.suggestedFix}${nextContent.slice(found + finding.evidence.length)}`;
      finding.status = 'edited';
      finding.start = found;
      finding.end = found + finding.suggestedFix.length;
      finding.resolution = {
        action: 'edited',
        by: author,
        at: now,
        note: 'Applied in a simulated creator revision (demo helper).',
      };
      applied += 1;
    }

    if (applied === 0) {
      throw new Error('There are no suggested fixes left to apply.');
    }

    review.content = nextContent;
    repositionGaps(review);
    const openAfter = review.findings.filter((f) => f.status === 'open').length;

    review.versions.push({
      id: newId('version'),
      number: nextVersionNumber(review.versions),
      content: nextContent,
      createdAt: now,
      author,
      note: 'Simulated creator revision: applied all suggested fixes. (Demo helper — no creator portal is connected.)',
      source: 'creator_revision',
      openFindings: openAfter,
    });

    review.status = 'in_review';
    review.decision = undefined;
    refreshDerived(review);

    review.comments.push({
      id: newId('comment'),
      author,
      role: review.submittedRole || 'Content Creator',
      body: "Creator revision: I've applied the suggested fixes and resubmitted this version for review.",
      createdAt: now,
      type: 'comment',
    });

    review.activity.unshift({
      id: newId('act'),
      type: 'version',
      message: `Creator revision uploaded with ${applied} suggested ${applied === 1 ? 'fix' : 'fixes'} applied (simulated).`,
      actor: author,
      at: now,
    });

    return this.save(review);
  }

  reset(): Review[] {
    this.reviews.clear();
    const ecoReviews = this.seedEcoFreshReviews();
    for (const r of ecoReviews) {
      this.reviews.set(r.id, r);
    }
    const seed = createSeedReviews();
    for (const r of seed) {
      this.reviews.set(r.id, r);
    }
    return this.list();
  }
}

const globalForReviewStore = globalThis as unknown as {
  backendReviewStore?: BackendReviewStore;
};

if (!globalForReviewStore.backendReviewStore) {
  globalForReviewStore.backendReviewStore = new BackendReviewStore();
}

export const backendReviewStore = globalForReviewStore.backendReviewStore;
