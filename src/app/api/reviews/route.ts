import { NextRequest, NextResponse } from 'next/server';
import { backendReviewStore } from '@/backend/reviewStore.ts';
import { generateReviewPackage } from '@/backend/reviewPackage.ts';
import { computeScore, DEMO_USER } from '@/lib/review-config';
import type { Finding, KnowledgeGap, Review, Severity } from '@/lib/types';

export const runtime = 'nodejs';

function newId(prefix: string) {
  const rand =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export async function GET() {
  const reviews = backendReviewStore.list();
  return NextResponse.json(reviews);
}

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Malformed or empty JSON request body.' },
        { status: 400 }
      );
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be a JSON object.' },
        { status: 400 }
      );
    }
    const {
      title,
      content,
      channel = 'Blog',
      isPaidPartnership = false,
      submittedBy,
      submitted_by,
      sourceFileName,
      department = 'marketing',
      brandKnowledgeText,
      custom_guidelines,
      brandKnowledgeFileName,
    } = body;

    const resolvedAuthor = (submittedBy || submitted_by || 'Arjun Rao').trim();
    const resolvedKnowledge = brandKnowledgeText || custom_guidelines;

    const cleanTitle = (title || '').trim();
    const cleanContent = (content || '').trim();

    if (cleanTitle.length < 3) {
      return NextResponse.json({ error: 'Add a title for this review.' }, { status: 400 });
    }
    if (cleanContent.length < 20) {
      return NextResponse.json(
        { error: 'Add at least 20 characters of content to review.' },
        { status: 400 }
      );
    }

    // Ingest custom brand knowledge document/text if provided
    if (resolvedKnowledge && typeof resolvedKnowledge === 'string' && resolvedKnowledge.trim().length >= 20) {
      const docName = brandKnowledgeFileName || `Brand_Knowledge_${Date.now().toString(36)}.md`;
      const paragraphs = resolvedKnowledge
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 15);

      const customChunks = (paragraphs.length > 0 ? paragraphs : [resolvedKnowledge.trim()]).map((p, i) => ({
        chunk_id: `custom-k-${Date.now().toString(36)}-${i + 1}`,
        text: p,
        section: `Section ${i + 1}`,
        page: 1,
        metadata: { source: docName },
      }));

      const { store } = await import('@/backend/store.ts');
      store.addChunks(customChunks, docName, 'style_rule', '1.0', department, 'internal');
      store.ensureSeedEmbeddings().catch((e) => console.warn('Custom chunk embedding warning:', e));
    }

    const now = new Date().toISOString();
    const id = newId('rev');

    // Run Two-RAG Brand Governance Package Engine
    const pkg = await generateReviewPackage({
      content: cleanContent,
      title: cleanTitle,
      creatorId: resolvedAuthor,
      department,
      confidentiality: 'internal',
      callerRole: 'content_creator',
      topK: 5,
    });

    const findings: Finding[] = [];
    const knowledgeGaps: KnowledgeGap[] = [];

    // Map findings
    if (Array.isArray(pkg.findings)) {
      pkg.findings.forEach((f: any, idx: number) => {
        const evidence = f.excerpt || '';
        let start = cleanContent.indexOf(evidence);
        if (start === -1) start = 0;
        const end = start + (evidence.length || 10);

        let category: Finding['category'] = 'Tone';
        if (f.category === 'unsupported_claim' || f.category === 'contradiction') {
          category = 'Claims';
        } else if (f.category === 'terminology') {
          category = 'Terminology';
        }

        const citation = f.citations?.[0] || {
          chunk_id: 'brand-gov-01',
          document: 'Enterprise_Brand_Style_Guide_2026.md',
          section: 'Brand Standards',
          quote: f.rule_violated || 'Brand Governance Standard',
        };

        findings.push({
          id: `find_${id}_${idx + 1}`,
          ruleId: citation.chunk_id || `rule_${idx + 1}`,
          ruleCode: (citation.chunk_id || 'BG-01').toUpperCase(),
          title: f.issue || 'Compliance Issue',
          category,
          severity: (['critical', 'high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium') as Severity,
          status: 'open',
          evidence: evidence || cleanContent.slice(0, 40),
          start,
          end,
          explanation: f.rule_violated || 'Violates enterprise brand standard.',
          suggestedFix: f.suggested_fix || evidence,
          confidence: f.confidence || 0.9,
          source: {
            sourceId: citation.chunk_id || 'brand-doc-01',
            title: citation.document || 'Brand Guidelines 2026',
            section: citation.section || 'General',
            quote: citation.quote || f.rule_violated || 'Approved Guideline',
            version: '2026.1',
            approvedBy: 'Brand Council',
            updatedAt: '2026-03-01',
          },
        });
      });
    }

    // Map unsupported claims into knowledge gaps
    if (Array.isArray(pkg.unsupported_claims)) {
      pkg.unsupported_claims.forEach((u: any, idx: number) => {
        const evidence = u.excerpt || u.claim_text || '';
        let start = cleanContent.indexOf(evidence);
        if (start === -1) start = 0;
        const end = start + (evidence.length || 10);

        knowledgeGaps.push({
          id: `gap_${id}_${idx + 1}`,
          topic: `Unsubstantiated Fact: ${evidence.slice(0, 60)}`,
          evidence,
          start,
          end,
          explanation: u.reason || 'Factual claim has no substantiated approved fact in brand repository.',
          recommendation: u.action_required || 'Verify with Subject Matter Expert or remove unverified numbers.',
          confidence: 0.95,
        });
      });
    }

    const score = pkg.summary?.compliance_score ?? computeScore(findings);
    const openFindings = findings.length;
    const gapsCount = knowledgeGaps.length;

    let summary = `${openFindings} open findings identified by Two-RAG Engine.`;
    if (gapsCount > 0) {
      summary += ` ${gapsCount} knowledge gap(s) detected that require human verification before publication.`;
    } else {
      summary += ' Content checked against approved facts and style guidelines.';
    }

    const review: Review = {
      id,
      title: cleanTitle,
      channel,
      status: 'in_review',
      content: cleanContent,
      submittedBy: resolvedAuthor,
      submittedRole: 'Content Creator',
      submittedAt: now,
      updatedAt: now,
      assignedTo: DEMO_USER.name,
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      isPaidPartnership: Boolean(isPaidPartnership),
      score,
      summary,
      findings,
      knowledgeGaps,
      versions: [
        {
          id: newId('version'),
          number: 1,
          content: cleanContent,
          createdAt: now,
          author: resolvedAuthor,
          note: sourceFileName ? `Initial submission from ${sourceFileName}.` : 'Initial submission.',
          source: 'submission',
          openFindings,
        },
      ],
      comments: [],
      activity: [
        {
          id: newId('act'),
          type: 'submitted',
          message: 'Submitted version 1 for Two-RAG compliance review.',
          actor: resolvedAuthor,
          at: now,
        },
        {
          id: newId('act'),
          type: 'analysis',
          message: `Two-RAG hybrid analysis completed with ${openFindings} finding(s) and ${gapsCount} knowledge gap(s).`,
          actor: 'BrandGuard Two-RAG Engine',
          at: now,
        },
      ],
      sourceFileName,
    };

    const saved = backendReviewStore.save(review);
    return NextResponse.json(saved);
  } catch (err: any) {
    console.error('Error in POST /api/reviews:', err);
    return NextResponse.json({ error: err.message || 'Failed to create review' }, { status: 500 });
  }
}
