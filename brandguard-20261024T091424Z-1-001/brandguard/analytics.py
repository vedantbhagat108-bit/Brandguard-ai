from datetime import datetime
from typing import Any
from .review_package import list_packages


def get_brand_analytics() -> dict[str, Any]:
    """Computes enterprise brand compliance analytics across all generated review packages."""
    packages = list_packages()
    total_packages = len(packages)

    all_findings = []
    all_unsupported = []
    all_gaps = []

    for p in packages:
        all_findings.extend(p.findings)
        all_unsupported.extend(p.unsupported_claims)
        all_gaps.extend(p.knowledge_gaps)

    # 1. Repeated Mistakes (top violated rules)
    rule_counts: dict[str, int] = {}
    for f in all_findings:
        rule_counts[f.rule_violated] = rule_counts.get(f.rule_violated, 0) + 1
    repeated_mistakes = sorted(
        [{"rule": r, "violations_count": c} for r, c in rule_counts.items()],
        key=lambda x: x["violations_count"],
        reverse=True,
    )[:10]

    # 2. Common Issue Types Breakdown
    category_counts: dict[str, int] = {
        "tone": 0,
        "terminology": 0,
        "contradiction": 0,
        "unsupported_claim": len(all_unsupported),
    }
    for f in all_findings:
        category_counts[f.category] = category_counts.get(f.category, 0) + 1

    # 3. Missing Knowledge Gaps
    gap_topics: dict[str, int] = {}
    for g in all_gaps:
        gap_topics[g.topic] = gap_topics.get(g.topic, 0) + 1
    missing_knowledge = [
        {"topic": t, "occurrences": c}
        for t, c in sorted(gap_topics.items(), key=lambda x: x[1], reverse=True)[:10]
    ]

    # 4. Guideline Clarification Proposals
    suggested_guideline_updates = []
    for item in repeated_mistakes[:3]:
        suggested_guideline_updates.append({
            "target_rule": item["rule"],
            "proposal": f"Clarify rule with practical positive/negative examples to prevent {item['violations_count']} repeated violations.",
            "requires_human_approval": True,
            "status": "PROPOSED",
        })

    return {
        "total_packages_reviewed": total_packages,
        "total_violations_flagged": len(all_findings),
        "total_unsupported_claims": len(all_unsupported),
        "total_knowledge_gaps": len(all_gaps),
        "repeated_mistakes": repeated_mistakes,
        "common_issue_types": category_counts,
        "missing_knowledge": missing_knowledge,
        "suggested_guideline_updates": suggested_guideline_updates,
        "generated_at": datetime.utcnow().isoformat(),
    }
