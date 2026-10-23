# BrandLens AI

**Explainable, human-in-the-loop content compliance review.**

BrandLens AI is a production-quality demo of a pre-publication brand governance workspace. A creator submits copy, the workspace highlights policy issues with cited evidence, and a named reviewer decides what happens next. The AI-style analysis is intentionally advisory: every finding is linked to an approved source, and anything the library cannot answer becomes a visible knowledge gap instead of a guess.

Built for the fictional **Aurelia Skin** workspace with synthetic content, policies and product facts.

---

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run typecheck   # TypeScript, no emit
npm run lint        # ESLint
npm run build       # Production build
npm run start       # Serve the production build
```

Node.js 20+ is recommended. The project was verified on Node 24 and Next.js 16.

No API keys, external AI providers, database or environment variables are required.

---

## The product

### Review queue and overview
- Workspace summary cards for reviews awaiting a decision, changes requested, open critical findings and average advisory score.
- Priority queue sorted by critical findings and due date.
- Status, severity, channel, creator, version, due-date and knowledge-gap signals.
- Empty, loading and failure states throughout.

### Content submission
- Paste copy or upload **PDF, DOCX, TXT or Markdown** (up to 5 MB).
- Client-side validation, character/word counts, editable extracted text and inline errors.
- Three pre-filled demo drafts: high risk, needs changes and pre-cleared copy.
- A four-step analysis dialog, then navigation to the new review.

### Evidence-linked review
- Original copy with inline severity highlights; selecting a highlight reveals the matching finding.
- Each finding shows:
  - rule code, category and severity;
  - the exact evidence and an explanation;
  - a suggested replacement with a before/after diff;
  - confidence;
  - the cited source title, version, section, approved quote and approver.
- **Accept**, **Edit**, **Dismiss**, **Request changes** and **Reject** actions, each with confirmation and audit context.
- Applying a fix rewrites the draft and creates an immutable version snapshot.
- Knowledge gaps are visually distinct from violations and include a human next step.
- Discussion thread with reviewer/creator messages and recorded decision comments.
- Version history with full read-only snapshots.
- A review activity audit trail.

### Approval screen
- Explicit human checklist: evidence reviewed, high-severity risk acknowledgement, paid-disclosure confirmation and final attestation.
- Critical findings hard-block approval.
- Approval note with templates and validation.
- Read-only decision record after approval or rejection.
- Rejection path with a required reason.

### Brand knowledge
- 6 approved sources, 10 policy rules and 4 approved product facts.
- Searchable rule library with category filters, severity, requirement and approved example.
- Source version, owner, approver, approval date and rule coverage.
- Study IDs and exact cleared product wording.

### Insights
- Derived entirely from the current workspace: average score, human decisions, fix acceptance rate, open findings, category/rule frequency, channel load, decision mix, resolution mix, severity mix and recurring knowledge gaps.

### Demo helpers
- **Simulate creator revision** on a changes-requested review applies the remaining suggested fixes and resubmits a new version, so the full loop can be demonstrated without a creator portal.
- **Reset demo data** in the sidebar restores the six seeded reviews.

---

## 5-minute demo script

1. **Overview** – point out the queue, open critical findings and average score. Open the banner's **Open the demo review**.
2. **Glow Renewal Serum** – show the highlighted copy, the missing paid disclosure and the medical/absolute claims. Click a highlight and then a finding.
3. **Evidence** – expand the cited source inside a finding. Emphasise that the quote, version and approver are visible.
4. **Human action** – accept one suggested fix. Show the new version, changed score and audit entry. Dismiss another finding with a reason to show that a human can override a flag.
5. **Knowledge gap** – open the bakuchiol safety gap. Explain that the product library has no evidence for blanket suitability, so BrandLens escalates instead of inventing support.
6. **Request changes** – add a creator note and request changes. Use **Simulate creator revision** to bring the review back.
7. **Approval** – open **Review & approve**, complete the checklist and note, and approve. Show the immutable decision record.
8. **Governance** – open **Brand knowledge** to show the underlying rules/sources, then **Insights** to show patterns across the six reviews.

The primary seeded review is `rev_glow_launch` at `/reviews/rev_glow_launch`.

---

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Workspace overview and priority queue |
| `/reviews` | Searchable, filterable review queue |
| `/reviews/[id]` | Evidence-linked review surface |
| `/reviews/[id]/approve` | Human checklist, approval and decision record |
| `/submit` | Text or document submission |
| `/policies` | Approved rules, sources and facts |
| `/insights` | Derived workspace analytics |
| `POST /api/extract` | PDF/DOCX/TXT/MD text extraction |

---

## Architecture

```text
src/
├── app/
│   ├── page.tsx                     # Overview
│   ├── reviews/page.tsx             # Queue
│   ├── reviews/[id]/page.tsx        # Review detail
│   ├── reviews/[id]/approve/page.tsx# Approval / decision record
│   ├── submit/page.tsx              # Submission flow
│   ├── policies/page.tsx            # Knowledge library
│   ├── insights/page.tsx            # Derived analytics
│   └── api/extract/route.ts         # Document text extraction
├── components/
│   ├── layout/                      # Shell, sidebar, header, search, demo guide
│   ├── providers/                   # Review state, toasts
│   ├── reviews/                     # Highlights, finding/gap cards, dialogs, discussion, versions
│   └── ui/                          # Buttons, cards, badges, modal, form, skeletons, etc.
└── lib/
    ├── types.ts                     # Domain and service contracts
    ├── review-config.ts             # Severity/status metadata, scoring, blockers
    ├── format.ts                    # Date and relative-time helpers
    ├── mock/
    │   ├── policy-data.ts           # Synthetic workspace, sources, rules, facts
    │   ├── review-engine.ts         # Deterministic rule matching + gaps
    │   └── seed-reviews.ts          # Six seeded reviews and demo samples
    └── services/
        ├── review-service.ts        # ReviewService interface
        ├── mock-review-service.ts   # Local implementation + persistence
        └── index.ts                 # Service singleton
```

### State and persistence
`ReviewProvider` calls the `ReviewService` interface and keeps the current review list in React state. Mutations return the updated review and replace it in the list.

The demo service stores data in `localStorage` under `brandlens.demo.reviews.v1` with a schema version. If storage is blocked or corrupt, the in-memory seeded cache still works. There is no server database.

### Scoring
Each open finding deducts from 100:

| Severity | Deduction |
| --- | --- |
| Critical | 12 |
| High | 8 |
| Medium | 4 |
| Low | 2 |

The score is clamped to 0–100 and shown as advisory, never as a legal verdict. Resolved and dismissed findings no longer deduct.

### Approval rules
- Approval is blocked while any **critical** finding is open.
- Open **high** findings require an explicit risk acknowledgement.
- Paid partnerships require a disclosure confirmation.
- Approval needs an evidence confirmation, final attestation and a note of at least 10 characters.
- Approved/rejected reviews lock findings for audit; follow-up comments are still allowed.

---

## Mock / live boundary

There was no existing API or backend contract in the workspace, so the app uses a clearly isolated mock implementation:

- `src/lib/services/review-service.ts` defines every operation the UI needs.
- `src/lib/services/mock-review-service.ts` implements it with deterministic analysis, realistic latency and `localStorage`.
- `src/lib/services/index.ts` exports the singleton. `reviewService.mode` is `"mock"`.
- No undocumented endpoint is called. No external AI provider is contacted.

To connect a real backend:

1. Implement `ReviewService` in a new `live-review-service.ts`, mapping the methods to your API.
2. Keep the returned domain shapes in `src/lib/types.ts` (or add explicit DTO mapping).
3. Switch the export in `src/lib/services/index.ts` based on an environment flag.
4. Keep the analysis engine server-side; the UI only needs the resulting findings, gaps and score.
5. Replace the synthetic `policy-data.ts` with versioned workspace knowledge from your source of truth.

The upload route is a real Next.js route (`/api/extract`) but only performs local document parsing. Files are not stored and are not sent to a third party.

---

## Document extraction

Supported: `.pdf`, `.docx`, `.txt`, `.md` · maximum 5 MB.

- PDF: `unpdf` text extraction; scanned/image-only PDFs without a text layer are rejected (no OCR).
- DOCX: `mammoth` raw-text extraction.
- TXT/MD: UTF-8 text.
- Extracted text is trimmed/normalised and editable before review.
- The review engine currently limits submissions to 20,000 characters in the UI; the extraction route returns up to 60,000 characters.

---

## Verification

Run locally:

```bash
npm run typecheck
npm run lint
npm run build
npx tsx@4 scripts/verify-engine.ts
npx tsx@4 scripts/smoke-workflow.ts
```

At the time of implementation:

- `npm run typecheck` – passed.
- `npm run lint` – passed with zero warnings/errors.
- `npm run build` – passed; all app routes compiled.
- `scripts/verify-engine.ts` – seeded scores and findings matched the intended demo:
  - Glow launch: 40, 7 findings, 1 knowledge gap.
  - Autumn email: 80, 3 findings.
  - Barrier LinkedIn: 100, approved.
  - Winter paid social: 72, 4 findings, rejected.
  - SPF page: 98, 1 low finding.
  - Festive brief: 100, approved.
- `scripts/smoke-workflow.ts` – 29 assertions passed across accept/edit/dismiss versioning, comments, request changes, simulated creator revision, approval, audit locking, validation, risky/clean submissions and demo reset.
- Route smoke test – `/`, `/reviews`, `/reviews/rev_glow_launch`, `/reviews/rev_glow_launch/approve`, `/submit`, `/policies`, `/insights` and `POST /api/extract` returned successful responses. The supplied PDF was used to verify PDF extraction.

### Manual QA checklist
- Submit both risky and clean sample drafts.
- Accept, edit and dismiss findings; verify the score, content and version history update.
- Request changes, simulate a creator revision and approve.
- Attempt approval with an unresolved critical finding and confirm it is blocked.
- Approve a review, then confirm findings are locked.
- Reset demo data and confirm the six reviews return.
- Test keyboard navigation through highlights, dialogs and the checklist.
- Check layouts at mobile, tablet and desktop widths.

---

## Limitations

- **Demo analysis, not production AI.** The engine uses deterministic wording patterns, not a language model. It demonstrates the workflow and explainability model, not broad semantic accuracy or recall.
- **Synthetic knowledge.** All policies, sources, facts, creators and reviews are fictional. They are not legal or regulatory advice.
- **Browser-local data.** Reviews and decisions live in `localStorage`; they are per-browser, unencrypted and not shared across devices or users.
- **No authentication or roles.** The UI assumes the signed-in demo reviewer (Manya Iyer). There is no access control, tenant isolation or reviewer assignment engine.
- **No creator portal.** The creator revision is a demo helper, not a real submission from another user.
- **Text only.** Visual assets, alt text quality, video, landing-page context and platform previews are not analysed.
- **No OCR.** Image-only/scanned PDFs cannot be read.
- **English-focused.** Rules and patterns are written in English; multilingual coverage is not verified.
- **No publishing integration.** Approval does not push content to a CMS or ad platform.
- **No server persistence, queue or audit export.** The decision record is visible in-app only.
- **Rule precision.** Pattern matching can miss paraphrased claims or flag legitimate copy. The human review step is intentional and required.

---

## Accessibility and design

- Semantic landmarks, skip link, visible focus rings and keyboard-operable highlights.
- Dialogs use focus trapping, Escape handling, labelled titles/descriptions and scroll locking.
- Status is never conveyed by colour alone; severity and state include text and icons.
- Responsive from narrow mobile through wide desktop.
- Respects `prefers-reduced-motion`.
- Severity and status palettes target readable contrast on tinted backgrounds.

---

## Future integration checklist

- [ ] Real content pipeline (CMS, DAM, social scheduler) and webhook intake.
- [ ] Versioned knowledge ingestion with owner approvals and effective dates.
- [ ] Server-side analysis with retrieval over approved sources and calibrated confidence.
- [ ] Organisation, role and permission model with SSO.
- [ ] Creator portal with threaded requests and resubmission.
- [ ] Immutable server audit log and export.
- [ ] Visual/alt-text and landing-page checks.
- [ ] Localisation and market-specific rule packs.
- [ ] Analytics on false positives, review time and rule effectiveness.

---

Built as a hackathon-ready product demo: the workflow is complete, the data is synthetic, and every automated claim is designed to be challenged by a human.
