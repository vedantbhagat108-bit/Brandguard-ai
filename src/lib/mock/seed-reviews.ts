import { daysAgo, hoursAgo, hoursFromNow } from "@/lib/format";
import { analyzeContent } from "@/lib/mock/review-engine";
import { DEMO_USER } from "@/lib/review-config";
import type {
  ActivityEvent,
  Channel,
  Review,
  ReviewComment,
  ReviewStatus,
  ReviewVersion,
} from "@/lib/types";

type SeedVersion = {
  content: string;
  createdAt: string;
  author: string;
  note: string;
  source: ReviewVersion["source"];
  openFindings?: number;
};

type SeedComment = Omit<ReviewComment, "id">;

type SeedActivity = Omit<ActivityEvent, "id">;

type SeedReviewInput = {
  id: string;
  title: string;
  channel: Channel;
  status: ReviewStatus;
  content: string;
  submittedBy: string;
  submittedRole: string;
  submittedAt: string;
  updatedAt: string;
  dueAt?: string;
  isPaidPartnership: boolean;
  versions: SeedVersion[];
  comments?: SeedComment[];
  activity?: SeedActivity[];
  decision?: Review["decision"];
};

function buildSeedReview(input: SeedReviewInput): Review {
  const analyzed = analyzeContent(
    {
      title: input.title,
      channel: input.channel,
      content: input.content,
      isPaidPartnership: input.isPaidPartnership,
    },
    input.id,
  );

  const openFindings = analyzed.findings.filter(
    (finding) => finding.status === "open",
  ).length;

  const versions: ReviewVersion[] = input.versions.map((version, index) => ({
    id: `${input.id}_v${index + 1}`,
    number: index + 1,
    content: version.content,
    createdAt: version.createdAt,
    author: version.author,
    note: version.note,
    source: version.source,
    openFindings: version.openFindings ?? openFindings,
  }));

  const comments: ReviewComment[] = (input.comments ?? []).map(
    (comment, index) => ({
      ...comment,
      id: `${input.id}_comment_${index + 1}`,
    }),
  );

  const activity: ActivityEvent[] = (input.activity ?? []).map(
    (event, index) => ({
      ...event,
      id: `${input.id}_activity_${index + 1}`,
    }),
  );

  return {
    id: input.id,
    title: input.title,
    channel: input.channel,
    status: input.status,
    content: input.content,
    submittedBy: input.submittedBy,
    submittedRole: input.submittedRole,
    submittedAt: input.submittedAt,
    updatedAt: input.updatedAt,
    assignedTo: DEMO_USER.name,
    dueAt: input.dueAt,
    isPaidPartnership: input.isPaidPartnership,
    score: analyzed.score,
    summary: analyzed.summary,
    findings: analyzed.findings,
    knowledgeGaps: analyzed.knowledgeGaps,
    versions,
    comments,
    activity,
    decision: input.decision,
  };
}

const glowContent =
  "Meet Glow Renewal Serum — the 100% chemical-free formula that clinically cures acne in 7 days. Don't let tired, dull skin hold you back. Our antioxidant complex is proven to reduce fine lines by 42%, and bakuchiol makes it safe for every skin type, with no exceptions. It's the #1 retinol alternative on the market. Shop the launch now — link in bio. ✨🌿";

const autumnContent =
  "The Autumn Ritual is here. For 48 hours only, enjoy 25% off the entire Ritual collection and free shipping on every order. Our dermatologist-approved routine is clinically proven to repair your skin barrier overnight. Members get early access — use code RITUAL25. Offer ends Sunday.";

const winterContent =
  "Your skin is damaged. Our new Winter Glow treatment is guaranteed to erase wrinkles in 14 days — dermatologists hate this one trick. Get 50% off forever when you sign up today. #ad";

const barrierContent =
  "Barrier Repair Moisturiser is back in stock. Formulated with ceramides and squalane, it helps support the skin's natural moisture barrier and leaves skin feeling comfortable all day. In a 12-week consumer study, 91% agreed their skin felt more hydrated (Study AUR-2025-021). Available now at aureliaskin.com. #ad";

const spfContent =
  "SPF 50 Daily Fluid is a lightweight, non-greasy sunscreen with broad-spectrum UVA/UVB protection. It layers well under makeup and leaves no white cast. Use generously and reapply every two hours. Always read the label.";

const festiveContent =
  "Festive Edit: share the warmth. Show the ritual, not perfection. Use approved product names, add #ad for paid partnerships, and keep every claim tied to the approved fact sheet. Captions under 80 words; add alt text for every asset.";

export function createSeedReviews(): Review[] {
  return [
    buildSeedReview({
      id: "rev_glow_launch",
      title: "Glow Renewal Serum — Instagram launch",
      channel: "Instagram",
      status: "in_review",
      content: glowContent,
      submittedBy: "Arjun Rao",
      submittedRole: "Content Creator",
      submittedAt: hoursAgo(2.2),
      updatedAt: hoursAgo(0.7),
      dueAt: hoursFromNow(4),
      isPaidPartnership: true,
      versions: [
        {
          content: `${glowContent} Don't wait — your best skin starts now.`,
          createdAt: hoursAgo(2.2),
          author: "Arjun Rao",
          note: "Initial submission for the Friday launch.",
          source: "submission",
          openFindings: 8,
        },
        {
          content: glowContent,
          createdAt: hoursAgo(0.9),
          author: "Arjun Rao",
          note: "Removed the closing urgency line before review.",
          source: "edit",
        },
      ],
      comments: [
        {
          author: "Arjun Rao",
          role: "Content Creator",
          body: "Launch is scheduled for 6pm Friday. Can we get a decision today? Happy to adjust any copy.",
          createdAt: hoursAgo(2.1),
          type: "comment",
        },
        {
          author: DEMO_USER.name,
          role: DEMO_USER.role,
          body: "I've flagged the paid-partnership disclosure and the claim language. Please hold publication until both critical items are resolved.",
          createdAt: hoursAgo(1.4),
          type: "comment",
        },
      ],
      activity: [
        {
          type: "submitted",
          message: "Submitted version 1 for compliance review.",
          actor: "Arjun Rao",
          at: hoursAgo(2.2),
        },
        {
          type: "analysis",
          message: "Mock analysis completed. Findings are linked to approved sources.",
          actor: "BrandLens engine",
          at: hoursAgo(2.1),
        },
        {
          type: "version",
          message: "Uploaded version 2 and removed the closing urgency line.",
          actor: "Arjun Rao",
          at: hoursAgo(0.9),
        },
        {
          type: "comment",
          message: "Asked the creator to hold publication until critical items are resolved.",
          actor: DEMO_USER.name,
          at: hoursAgo(1.4),
        },
      ],
    }),

    buildSeedReview({
      id: "rev_autumn_email",
      title: "Autumn Ritual — subscriber email",
      channel: "Email",
      status: "changes_requested",
      content: autumnContent,
      submittedBy: "Priya Shah",
      submittedRole: "Lifecycle Marketing",
      submittedAt: daysAgo(1.4),
      updatedAt: hoursAgo(4),
      dueAt: hoursFromNow(20),
      isPaidPartnership: false,
      versions: [
        {
          content:
            "The Autumn Ritual is here. For 48 hours only, enjoy 25% off the entire collection. Our dermatologist-approved routine will transform your skin overnight. Offer ends soon.",
          createdAt: daysAgo(1.4),
          author: "Priya Shah",
          note: "Initial subscriber email draft.",
          source: "submission",
          openFindings: 4,
        },
        {
          content:
            "The Autumn Ritual is here. For 48 hours only, enjoy 25% off the entire Ritual collection and free shipping on every order. Our dermatologist-approved routine is clinically proven to repair your skin barrier overnight. Use code RITUAL25. Offer ends Sunday.",
          createdAt: hoursAgo(7),
          author: "Priya Shah",
          note: "Added the offer end date and removed the subject-line discount.",
          source: "creator_revision",
          openFindings: 3,
        },
        {
          content: autumnContent,
          createdAt: hoursAgo(5),
          author: "Priya Shah",
          note: "Final revision for reviewer re-check before the send.",
          source: "edit",
        },
      ],
      comments: [
        {
          author: DEMO_USER.name,
          role: DEMO_USER.role,
          body: "Two claim issues block approval: remove 'dermatologist-approved' and replace the overnight claim with approved study wording. The shipping message also needs a minimum order value.",
          createdAt: daysAgo(1.1),
          type: "comment",
        },
        {
          author: "Priya Shah",
          role: "Lifecycle Marketing",
          body: "Added the end date and removed the discount from the subject line. I don't have a study ID for the barrier claim — can you advise?",
          createdAt: hoursAgo(5),
          type: "comment",
        },
        {
          author: DEMO_USER.name,
          role: DEMO_USER.role,
          body: "Use Study AUR-2025-021 for the hydration claim, and keep the '48 hours only' deadline aligned with the send schedule. I'll re-check once the copy is updated.",
          createdAt: hoursAgo(4),
          type: "comment",
        },
      ],
      activity: [
        {
          type: "submitted",
          message: "Submitted version 1 for compliance review.",
          actor: "Priya Shah",
          at: daysAgo(1.4),
        },
        {
          type: "analysis",
          message: "Mock analysis completed with 4 findings.",
          actor: "BrandLens engine",
          at: daysAgo(1.35),
        },
        {
          type: "comment",
          message: "Requested changes on offer terms and claim substantiation.",
          actor: DEMO_USER.name,
          at: daysAgo(1.1),
        },
        {
          type: "version",
          message: "Creator uploaded version 3 for re-review.",
          actor: "Priya Shah",
          at: hoursAgo(5),
        },
      ],
    }),

    buildSeedReview({
      id: "rev_barrier_linkedin",
      title: "Barrier Repair Moisturiser — LinkedIn launch",
      channel: "LinkedIn",
      status: "approved",
      content: barrierContent,
      submittedBy: "Priya Shah",
      submittedRole: "Lifecycle Marketing",
      submittedAt: daysAgo(3.2),
      updatedAt: daysAgo(1.2),
      isPaidPartnership: true,
      versions: [
        {
          content:
            "Barrier Repair Moisturiser is back. Formulated with ceramides and squalane, it repairs your barrier overnight. In a 12-week consumer study, 91% agreed their skin felt more hydrated (Study AUR-2025-021). #ad",
          createdAt: daysAgo(3.2),
          author: "Priya Shah",
          note: "Initial LinkedIn draft.",
          source: "submission",
          openFindings: 2,
        },
        {
          content: barrierContent,
          createdAt: daysAgo(1.4),
          author: "Priya Shah",
          note: "Replaced 'repairs overnight' with the approved hydration wording.",
          source: "creator_revision",
        },
      ],
      comments: [
        {
          author: DEMO_USER.name,
          role: DEMO_USER.role,
          body: "Disclosure is present and the consumer-study wording matches the approved fact sheet. Approving for LinkedIn.",
          createdAt: daysAgo(1.2),
          type: "decision",
        },
      ],
      decision: {
        action: "approved",
        by: DEMO_USER.name,
        at: daysAgo(1.2),
        note: "Evidence checked against Claims Policy v2.4 and Study AUR-2025-021. #ad is present and no findings remain open.",
      },
      activity: [
        {
          type: "submitted",
          message: "Submitted version 1 for compliance review.",
          actor: "Priya Shah",
          at: daysAgo(3.2),
        },
        {
          type: "version",
          message: "Creator replaced the overnight repair claim with approved wording.",
          actor: "Priya Shah",
          at: daysAgo(1.4),
        },
        {
          type: "decision",
          message: "Approved for publication on LinkedIn.",
          actor: DEMO_USER.name,
          at: daysAgo(1.2),
        },
      ],
    }),

    buildSeedReview({
      id: "rev_winter_paid",
      title: "Winter Glow — paid social",
      channel: "Paid social",
      status: "rejected",
      content: winterContent,
      submittedBy: "Rohan Mehta",
      submittedRole: "Agency Creator",
      submittedAt: daysAgo(4.4),
      updatedAt: daysAgo(4.1),
      isPaidPartnership: true,
      versions: [
        {
          content: winterContent,
          createdAt: daysAgo(4.4),
          author: "Rohan Mehta",
          note: "Agency creative route 1 for the winter sale.",
          source: "submission",
        },
      ],
      comments: [
        {
          author: "Rohan Mehta",
          role: "Agency Creator",
          body: "The client wants this live tomorrow for the sale. Can we make it work with a disclaimer?",
          createdAt: daysAgo(4.3),
          type: "comment",
        },
        {
          author: DEMO_USER.name,
          role: DEMO_USER.role,
          body: "A disclaimer cannot rescue a guaranteed wrinkle-erasure claim or a perpetual discount. Rejecting this route; please brief the agency on Claims Policy §2 before resubmission.",
          createdAt: daysAgo(4.1),
          type: "decision",
        },
      ],
      decision: {
        action: "rejected",
        by: DEMO_USER.name,
        at: daysAgo(4.1),
        note: "Cannot approve: guaranteed wrinkle-erasure and a 'forever' discount are prohibited. Do not publish. Brief the agency on Claims Policy §2 before resubmission.",
      },
      activity: [
        {
          type: "submitted",
          message: "Submitted version 1 for compliance review.",
          actor: "Rohan Mehta",
          at: daysAgo(4.4),
        },
        {
          type: "analysis",
          message: "Mock analysis found 1 critical and 3 secondary issues.",
          actor: "BrandLens engine",
          at: daysAgo(4.35),
        },
        {
          type: "decision",
          message: "Rejected for publication.",
          actor: DEMO_USER.name,
          at: daysAgo(4.1),
        },
      ],
    }),

    buildSeedReview({
      id: "rev_spf_page",
      title: "SPF 50 Daily Fluid — product page",
      channel: "Product page",
      status: "in_review",
      content: spfContent,
      submittedBy: "Priya Shah",
      submittedRole: "Lifecycle Marketing",
      submittedAt: hoursAgo(5.1),
      updatedAt: hoursAgo(5),
      dueAt: hoursFromNow(20),
      isPaidPartnership: false,
      versions: [
        {
          content: spfContent,
          createdAt: hoursAgo(5.1),
          author: "Priya Shah",
          note: "Product page copy for the SPF restage.",
          source: "submission",
        },
      ],
      activity: [
        {
          type: "submitted",
          message: "Submitted version 1 for compliance review.",
          actor: "Priya Shah",
          at: hoursAgo(5.1),
        },
        {
          type: "analysis",
          message:
            "Mock analysis found 1 low-severity finding. Ready for reviewer sign-off.",
          actor: "BrandLens engine",
          at: hoursAgo(5),
        },
      ],
    }),

    buildSeedReview({
      id: "rev_festive_brief",
      title: "Festive Edit — creator brief",
      channel: "Creator brief",
      status: "approved",
      content: festiveContent,
      submittedBy: "Arjun Rao",
      submittedRole: "Content Creator",
      submittedAt: daysAgo(7),
      updatedAt: daysAgo(6.5),
      isPaidPartnership: false,
      versions: [
        {
          content: festiveContent,
          createdAt: daysAgo(7),
          author: "Arjun Rao",
          note: "Internal creator guidance for the festive campaign.",
          source: "submission",
        },
      ],
      comments: [
        {
          author: DEMO_USER.name,
          role: DEMO_USER.role,
          body: "Approved as internal guidance. Disclosure instructions are clear and no promotional claims are included.",
          createdAt: daysAgo(6.5),
          type: "decision",
        },
      ],
      decision: {
        action: "approved",
        by: DEMO_USER.name,
        at: daysAgo(6.5),
        note: "Approved as internal guidance. No promotional claims; paid-partnership instructions are included.",
      },
      activity: [
        {
          type: "submitted",
          message: "Submitted the creator brief for a compliance check.",
          actor: "Arjun Rao",
          at: daysAgo(7),
        },
        {
          type: "decision",
          message: "Approved as internal guidance.",
          actor: DEMO_USER.name,
          at: daysAgo(6.5),
        },
      ],
    }),
  ];
}

export type DemoSample = {
  id: string;
  title: string;
  channel: Channel;
  isPaidPartnership: boolean;
  content: string;
  badge: string;
  description: string;
};

export const DEMO_SAMPLES: DemoSample[] = [
  {
    id: "sample_glow",
    title: "Glow Renewal Serum — new launch caption",
    channel: "Instagram",
    isPaidPartnership: true,
    content: glowContent,
    badge: "High risk",
    description:
      "The full demo case with claim, disclosure and tone issues.",
  },
  {
    id: "sample_autumn",
    title: "Autumn Ritual — follow-up email",
    channel: "Email",
    isPaidPartnership: false,
    content:
      "The Autumn Ritual is here. For 48 hours only, enjoy 25% off the entire Ritual collection and free shipping on every order. Our dermatologist-approved routine is clinically proven to repair your skin barrier overnight. Use code RITUAL25. Offer ends Sunday.",
    badge: "Needs changes",
    description:
      "Claim substantiation and offer-term issues for a realistic review loop.",
  },
  {
    id: "sample_barrier",
    title: "Barrier Repair — LinkedIn refresh",
    channel: "LinkedIn",
    isPaidPartnership: true,
    content: barrierContent,
    badge: "Clean copy",
    description:
      "A pre-cleared example that should pass the mock policy checks.",
  },
];
