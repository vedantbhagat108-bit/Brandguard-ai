import fs from 'fs';
import path from 'path';
import { computeScore, DEMO_USER } from '@/lib/review-config';
import type {
  FindingAction,
  Review,
  ReviewComment,
  ReviewVersion,
} from '@/lib/types';
import { securityDB, SubmissionRecord } from './database.ts';

const LEGACY_DEMO_REVIEW_IDS = new Set([
  'rev_ecofresh_miracle',
  'rev_ecofresh_spring',
  'rev_glow_launch',
  'rev_autumn_ritual',
  'rev_winter_glow',
  'rev_barrier_repair',
  'rev_spf_mist',
]);

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

class BackendReviewStore {
  private reviews: Map<string, Review> = new Map();
  private initialized = false;

  private getStorageFilePath(): string {
    try {
      const localDir = path.join(process.cwd(), '.data');
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      fs.accessSync(localDir, fs.constants.W_OK);
      return path.join(localDir, 'reviews-db.json');
    } catch {
      return '/tmp/brandlens-reviews-db.json';
    }
  }

  private loadFromDisk() {
    try {
      const filePath = this.getStorageFilePath();
      if (!fs.existsSync(filePath)) return;
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.reviews)) {
        for (const [id, rev] of parsed.reviews) {
          if (id && rev && rev.title && !LEGACY_DEMO_REVIEW_IDS.has(id)) {
            this.reviews.set(id, rev as Review);
          }
        }
      }
    } catch {
      // Ignore missing or unreadable disk file
    }
  }

  public saveToDisk() {
    try {
      const filePath = this.getStorageFilePath();
      const payload = {
        reviews: Array.from(this.reviews.entries()),
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      // Safe fallback in read-only environments
    }
  }

  private syncToSecurityDB(review: Review) {
    const mappedStatus: SubmissionRecord['status'] =
      review.status === 'approved'
        ? 'APPROVED'
        : review.status === 'rejected'
        ? 'REJECTED'
        : review.status === 'changes_requested'
        ? 'CHANGES_REQUESTED'
        : 'PENDING_REVIEW';

    const submissionRecord: SubmissionRecord = {
      id: review.id,
      brand_id: 'b0000001-0000-4000-8000-000000000001',
      creator_id: review.submittedBy || 'creator',
      campaign_name: review.title,
      raw_content: review.content,
      status: mappedStatus,
      advisory_score: review.score,
      reviewer_comments: review.decision?.note || review.comments?.[review.comments.length - 1]?.body || null,
      created_at: review.submittedAt || new Date().toISOString(),
      findings: (review.findings || []).map((f) => ({
        id: f.id,
        submission_id: review.id,
        issue_type:
          f.category === 'Claims'
            ? 'UNSUPPORTED_CLAIM'
            : f.category === 'Terminology'
            ? 'MESSAGING_CLAIM'
            : 'TONE_LANGUAGE',
        severity: f.severity.toUpperCase() as any,
        flagged_text: f.evidence,
        source_id: f.source?.sourceId || f.ruleId,
        source_evidence: f.source?.quote || '',
        explanation: f.explanation,
        suggested_edit: f.suggestedFix,
      })),
    };

    securityDB.submissions.set(review.id, submissionRecord);
    securityDB.saveToDisk();
  }

  private init() {
    if (!this.initialized) {
      this.loadFromDisk();
      this.initialized = true;
    }
    for (const demoId of LEGACY_DEMO_REVIEW_IDS) {
      this.reviews.delete(demoId);
    }
  }

  list(): Review[] {
    this.init();
    this.loadFromDisk();
    return Array.from(this.reviews.values())
      .filter((r) => !LEGACY_DEMO_REVIEW_IDS.has(r.id))
      .map((r) => clone(sanitizeReviewState(r)))
      .sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }

  get(id: string): Review | null {
    this.init();
    if (!this.reviews.has(id)) {
      this.loadFromDisk();
    }
    const r = this.reviews.get(id);
    return r ? clone(sanitizeReviewState(r)) : null;
  }

  save(review: Review): Review {
    this.init();
    sanitizeReviewState(review);
    review.updatedAt = new Date().toISOString();
    this.reviews.set(review.id, clone(review));
    this.saveToDisk();
    this.syncToSecurityDB(review);
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
    const author = review.submittedBy || 'Creator';

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
        note: 'Applied suggested fixes in creator revision.',
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
      note: 'Creator revision: applied suggested fixes.',
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
      message: `Creator revision uploaded with ${applied} suggested ${applied === 1 ? 'fix' : 'fixes'} applied.`,
      actor: author,
      at: now,
    });

    return this.save(review);
  }

  delete(id: string): boolean {
    this.init();
    const existing = this.reviews.get(id);
    if (!existing) return false;
    this.reviews.delete(id);
    securityDB.submissions.delete(id);
    this.saveToDisk();
    securityDB.saveToDisk();
    return true;
  }

  deleteReviewsForUser(userIdentifier: string, userEmail?: string): number {
    this.init();
    this.loadFromDisk();
    let count = 0;
    const cleanId = (userIdentifier || '').trim().toLowerCase();
    const cleanEmail = (userEmail || '').trim().toLowerCase();
    if (!cleanId && !cleanEmail) return 0;

    for (const [id, r] of Array.from(this.reviews.entries())) {
      const match =
        (cleanId && (r.submittedBy || '').toLowerCase() === cleanId) ||
        (cleanEmail && ((r.submittedBy || '').toLowerCase() === cleanEmail || (r.submittedRole || '').toLowerCase().includes(cleanEmail)));
      if (match) {
        this.reviews.delete(id);
        securityDB.submissions.delete(id);
        count++;
      }
    }
    if (count > 0) {
      this.saveToDisk();
      securityDB.saveToDisk();
    }
    return count;
  }

  reset(): Review[] {
    this.reviews.clear();
    securityDB.submissions.clear();
    this.saveToDisk();
    securityDB.saveToDisk();
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
