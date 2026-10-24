"""BrandGuard AI: Comprehensive Automated Test Suite
Validates:
1. LLM claim extraction & classification (factual, tonal, terminology)
2. Unsupported-claim & knowledge-gap detection (factual claims with no approved-fact evidence flagged)
3. Separate querying of approved facts vs style rules
4. /review-package endpoint generation
5. Workflow state machine & RBAC
"""

import asyncio
import sys
import unittest

from brandguard.config import settings
from brandguard.ingest import ingest_document
from brandguard.schemas import CorrectRequest, Finding, ReviewPackageRequest, WorkflowActionRequest
from brandguard.claims import extract_and_classify_claims
from brandguard.retrieve import retrieve_for_claims, retrieve_hybrid
from brandguard.analyze import analyze_content
from brandguard.correct import correct_content
from brandguard.review_package import generate_review_package
from brandguard.workflow import apply_workflow_action
from brandguard.store import get_store


class BrandGuardTestSuite(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Seed test brand repository
        loop = asyncio.get_event_loop()
        loop.run_until_complete(cls._seed_knowledge_base())

    @classmethod
    async def _seed_knowledge_base(cls):
        # 1. Ingest Style Rule Document
        style_guide = (
            "# Tone of Voice & Terminology Guidelines\n"
            "Our brand voice is confident, humble, and clear. Never use aggressive superlative words like 'unbeatable', "
            "'revolutionary', or '#1'.\n"
            "Always capitalize BrandGuard. Never refer to BrandGuard as 'the script' or 'the bot'.\n"
            "We do not make absolute promises or guarantees of zero defects.\n"
        )
        await ingest_document(
            filename="Brand_Style_Guide_2026.md",
            data=style_guide.encode("utf-8"),
            doc_type="style_rule",
            department="marketing",
            confidentiality="internal",
        )

        # 2. Ingest Approved Fact Document
        approved_facts = (
            "# Enterprise Infrastructure Verified Facts\n"
            "BrandGuard AI guarantees an SLA uptime of 99.95% under enterprise service contracts.\n"
            "The platform is SOC2 Type II certified and ISO 27001 compliant.\n"
            "Current active enterprise installations number 1,200 organizations worldwide.\n"
        )
        await ingest_document(
            filename="Verified_Product_Facts_2026.md",
            data=approved_facts.encode("utf-8"),
            doc_type="approved_fact",
            department="marketing",
            confidentiality="internal",
        )

    def test_01_store_indexing(self):
        store = get_store()
        self.assertGreater(store.count(), 0, "Vector store should contain indexed chunks")
        docs = store.list_documents()
        doc_names = [d["document"] for d in docs]
        self.assertIn("Brand_Style_Guide_2026.md", doc_names)
        self.assertIn("Verified_Product_Facts_2026.md", doc_names)

    def test_02_claim_extraction_and_classification(self):
        loop = asyncio.get_event_loop()
        content = (
            "BrandGuard delivers 99.95% uptime SLA. We are the revolutionary leader in compliance. "
            "Our system never fails."
        )
        claims = loop.run_until_complete(extract_and_classify_claims(content))
        self.assertGreater(len(claims), 0, "Should extract semantic claims")
        types = {c.claim_type for c in claims}
        # Verify that classification identified types
        self.assertTrue(
            "factual" in types or "tonal" in types or "terminology" in types,
            "Claims should be tagged as factual, tonal, or terminology",
        )

    def test_03_separate_query_pools(self):
        loop = asyncio.get_event_loop()
        # Query approved facts specifically
        fact_hits = loop.run_until_complete(
            retrieve_hybrid("What is our guaranteed SLA uptime?", doc_type="approved_fact")
        )
        for h in fact_hits:
            self.assertEqual(h.doc_type, "approved_fact", "Should only retrieve from approved_fact pool")

        # Query style rules specifically
        style_hits = loop.run_until_complete(
            retrieve_hybrid("Can we use words like revolutionary?", doc_type="style_rule")
        )
        for h in style_hits:
            self.assertEqual(h.doc_type, "style_rule", "Should only retrieve from style_rule pool")

    def test_04_unsupported_claim_detection(self):
        """CRITICAL: Factual claims with no approved-fact evidence must be flagged, not pass silently!"""
        loop = asyncio.get_event_loop()
        # Content with an unsubstantiated factual claim: NASA partnership & 50 million transactions
        content = "We process 50 million transactions per day and are officially certified by NASA."
        res = loop.run_until_complete(analyze_content(content))

        # Check unsupported claims list
        self.assertGreater(
            len(res.unsupported_claims),
            0,
            "Factual claim without approved fact in RAG 1 MUST be flagged as unsupported_claim!",
        )
        self.assertGreater(
            len(res.knowledge_gaps),
            0,
            "Unsupported factual claims MUST generate knowledge gap records!",
        )

        # Check findings list includes unsupported_claim category
        categories = [f.category for f in res.findings]
        self.assertIn(
            "unsupported_claim",
            categories,
            "Findings must contain an unsupported_claim category item",
        )

    def test_05_review_package_endpoint(self):
        """Test /review-package complete generation."""
        loop = asyncio.get_event_loop()
        req = ReviewPackageRequest(
            content="BrandGuard delivers 99.95% uptime SLA. We are the revolutionary leader with 500 million daily users.",
            title="Q4 Press Release",
            creator_id="creator-test",
            department="marketing",
            caller_role="content_creator",
        )
        pkg = loop.run_until_complete(generate_review_package(req))

        self.assertIsNotNone(pkg.package_id)
        self.assertIsNotNone(pkg.summary)
        self.assertGreater(pkg.summary.total_claims, 0)
        self.assertTrue(len(pkg.change_history) > 0)
        self.assertIn(pkg.workflow_status, ("pending_manager", "pending_reviewer", "blocked"))

    def test_06_workflow_state_transitions(self):
        """Test workflow transitions between Creator, Manager, and Reviewer."""
        loop = asyncio.get_event_loop()
        req = ReviewPackageRequest(
            content="BrandGuard is an enterprise solution.",
            title="Quick Test",
            creator_id="author-1",
        )
        pkg = loop.run_until_complete(generate_review_package(req))

        # Manager approves
        action_req = WorkflowActionRequest(
            package_id=pkg.package_id,
            action="approve",
            actor_id="manager-1",
            actor_role="manager",
            notes="Reviewed and approved by manager",
        )
        resp = apply_workflow_action(action_req)
        self.assertEqual(resp.status, "pending_reviewer")

        # Authorised Reviewer approves
        action_req_2 = WorkflowActionRequest(
            package_id=pkg.package_id,
            action="approve",
            actor_id="reviewer-1",
            actor_role="authorised_reviewer",
            notes="Final publication approval granted",
        )
        resp_2 = apply_workflow_action(action_req_2)
        self.assertEqual(resp_2.status, "approved")


if __name__ == "__main__":
    unittest.main()
