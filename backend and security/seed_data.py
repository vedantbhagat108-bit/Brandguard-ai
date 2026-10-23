import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy.orm import Session

# Ensure intra-package imports resolve cleanly
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from database import engine, SessionLocal, Base
from models import (
    BrandWorkspace,
    BrandPin,
    User,
    BrandGuideline,
    Submission,
    SubmissionFinding,
    AuditLog,
    utc_now,
    default_pin_expiry,
)
from auth_handler import hash_password


def seed_demo_data():
    """Populates the database with multi-tenant workspaces, PINs, demo users, guidelines, and submissions."""
    print("=" * 68)
    print("  BrandLens AI - Demo Data Seeding & Multi-Tenant Setup")
    print("=" * 68)

    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        # Check idempotency
        existing_brand = db.query(BrandWorkspace).filter(
            BrandWorkspace.name == "EcoFresh Botanicals"
        ).first()

        if existing_brand:
            print("[i] EcoFresh Botanicals workspace already exists. Seeding skipped.")
            _print_summary(db)
            return

        # ---------------------------------------------------------
        # 1. Brands
        # ---------------------------------------------------------
        print("[+] Creating Brand Workspaces...")
        brand_eco = BrandWorkspace(
            id=uuid.uuid4(),
            name="EcoFresh Botanicals",
            created_at=utc_now(),
        )
        brand_nova = BrandWorkspace(
            id=uuid.uuid4(),
            name="NovaTech Cloud",
            created_at=utc_now(),
        )
        db.add_all([brand_eco, brand_nova])
        db.flush()

        # ---------------------------------------------------------
        # 2. Brand PINs (Single-Use Burnable OTPs)
        # ---------------------------------------------------------
        print("[+] Seeding Single-Use BrandPINs...")
        pin_eco_active = BrandPin(
            id=uuid.uuid4(),
            brand_id=brand_eco.id,
            pin_code="ECO-8821",
            expires_at=default_pin_expiry(),
            is_used=False,
        )
        pin_nova_active = BrandPin(
            id=uuid.uuid4(),
            brand_id=brand_nova.id,
            pin_code="NOVA-4410",
            expires_at=default_pin_expiry(),
            is_used=False,
        )
        pin_eco_burned = BrandPin(
            id=uuid.uuid4(),
            brand_id=brand_eco.id,
            pin_code="ECO-0019",
            expires_at=default_pin_expiry(),
            is_used=True,
            used_by_email="onboarded_creator@ecofresh.com",
            used_at=utc_now(),
        )
        db.add_all([pin_eco_active, pin_nova_active, pin_eco_burned])
        db.flush()

        # ---------------------------------------------------------
        # 3. Demo Users (Password: demo123)
        # ---------------------------------------------------------
        print("[+] Seeding Demo Users (Password: demo123)...")
        demo_hashed = hash_password("demo123")

        user_admin = User(
            id=uuid.uuid4(),
            email="admin@ecofresh.com",
            hashed_password=demo_hashed,
            role="ADMIN",
            brand_id=brand_eco.id,
        )
        user_reviewer = User(
            id=uuid.uuid4(),
            email="reviewer@ecofresh.com",
            hashed_password=demo_hashed,
            role="REVIEWER",
            brand_id=brand_eco.id,
        )
        user_creator = User(
            id=uuid.uuid4(),
            email="creator@ecofresh.com",
            hashed_password=demo_hashed,
            role="CREATOR",
            brand_id=brand_eco.id,
        )
        db.add_all([user_admin, user_reviewer, user_creator])
        db.flush()

        # ---------------------------------------------------------
        # 4. Brand Guidelines (EcoFresh Botanicals)
        # ---------------------------------------------------------
        print("[+] Seeding Compliance Guidelines...")
        g_legal = BrandGuideline(
            id=uuid.uuid4(),
            brand_id=brand_eco.id,
            title="Therapeutic & Medical Claims Prohibition",
            category="legal_marketing_policy",
            content="EcoFresh products are natural dietary wellness supplements. Marketing content must NEVER claim that our products 'cure', 'treat', 'prevent', or offer a '100% guarantee' for any medical disease or physiological condition.",
            version=1,
        )
        g_disclaimer = BrandGuideline(
            id=uuid.uuid4(),
            brand_id=brand_eco.id,
            title="Metabolism & Dietary FDA Disclaimer",
            category="disclaimers",
            content="Any promotional copy referencing metabolism, weight, or digestive health must include: 'These statements have not been evaluated by the FDA. This product is not intended to diagnose, treat, cure, or prevent any disease.'",
            version=1,
        )
        g_tone = BrandGuideline(
            id=uuid.uuid4(),
            brand_id=brand_eco.id,
            title="Authentic & Transparent Tone",
            category="style_tone",
            content="Copy must adopt an authentic, educational, and humble tone. Avoid aggressive sales urgency, fear-mongering, or hyperbolic superlatives like 'miracle cure'.",
            version=1,
        )
        db.add_all([g_legal, g_disclaimer, g_tone])
        db.flush()

        # ---------------------------------------------------------
        # 5. Demo Submissions & Findings
        # ---------------------------------------------------------
        print("[+] Seeding Submissions & Granular Findings...")

        # Flagged violation draft (Score: 24)
        sub_flagged = Submission(
            id=uuid.uuid4(),
            brand_id=brand_eco.id,
            creator_id=user_creator.id,
            campaign_name="Miracle Metabolism Drops",
            raw_content="Our new herbal drops are a 100% guarantee cure for slow metabolism and will eliminate all digestive fatigue within 24 hours!",
            status="CHANGES_REQUESTED",
            advisory_score=24,
            reviewer_comments="Severe policy violations: prohibited cure claims and missing FDA disclaimer.",
        )
        db.add(sub_flagged)
        db.flush()

        finding_1 = SubmissionFinding(
            id=uuid.uuid4(),
            submission_id=sub_flagged.id,
            issue_type="UNSUPPORTED_CLAIM",
            severity="CRITICAL",
            flagged_text="100% guarantee cure for slow metabolism",
            source_id=str(g_legal.id),
            source_evidence=g_legal.content,
            explanation="Prohibited medical cure claim violating FDA compliance and brand marketing rules.",
            suggested_edit="supports healthy natural digestive wellness",
        )
        finding_2 = SubmissionFinding(
            id=uuid.uuid4(),
            submission_id=sub_flagged.id,
            issue_type="MISSING_DISCLAIMER",
            severity="HIGH",
            flagged_text="Miracle Metabolism Drops",
            source_id=str(g_disclaimer.id),
            source_evidence=g_disclaimer.content,
            explanation="Metabolism claims require the mandatory FDA disclaimer.",
            suggested_edit="Include mandatory FDA disclaimer at the bottom of promotional copy.",
        )
        db.add_all([finding_1, finding_2])

        # Clean approved draft (Score: 96)
        sub_clean = Submission(
            id=uuid.uuid4(),
            brand_id=brand_eco.id,
            creator_id=user_creator.id,
            campaign_name="Spring Botanical Renewal",
            raw_content="Embrace nature this spring with our cold-pressed herbal wellness infusion. Formulated with organic chamomile and peppermint to support your mindful daily routine. These statements have not been evaluated by the FDA. This product is not intended to diagnose, treat, cure, or prevent any disease.",
            status="APPROVED",
            advisory_score=96,
            reviewer_comments="Fully compliant with brand tone and legal disclaimer requirements.",
        )
        db.add(sub_clean)
        db.flush()

        # ---------------------------------------------------------
        # 6. Audit Logs
        # ---------------------------------------------------------
        print("[+] Seeding Initial Audit Ledger Records...")
        audit_1 = AuditLog(
            brand_id=brand_eco.id,
            user_id=user_admin.id,
            action="PIN_GENERATED",
            details={"pin_code": "ECO-8821", "brand": "EcoFresh Botanicals"}
        )
        audit_2 = AuditLog(
            brand_id=brand_eco.id,
            user_id=user_admin.id,
            action="KB_INGESTED",
            details={"guidelines_count": 3, "brand": "EcoFresh Botanicals"}
        )
        audit_3 = AuditLog(
            brand_id=brand_eco.id,
            user_id=user_creator.id,
            action="CONTENT_SUBMITTED",
            details={"campaign": "Spring Botanical Renewal", "advisory_score": 96}
        )
        db.add_all([audit_1, audit_2, audit_3])

        db.commit()
        print("[+] Database successfully populated with synthetic demo data!")
        _print_summary(db)

    except Exception as exc:
        db.rollback()
        print(f"[-] Error during seeding: {exc}")
        raise
    finally:
        db.close()


def _print_summary(db: Session):
    brands = db.query(BrandWorkspace).all()
    users = db.query(User).all()
    pins = db.query(BrandPin).all()
    subs = db.query(Submission).all()

    print("-" * 68)
    print("  SEED DATA INVENTORY & CREDENTIALS")
    print("-" * 68)
    print(f"Workspaces ({len(brands)}):")
    for b in brands:
        print(f"  - {b.name:<25} ID: {b.id}")

    print(f"\nBrand PINs ({len(pins)}):")
    for p in pins:
        status_str = f"BURNED (used by {p.used_by_email})" if p.is_used else "ACTIVE"
        print(f"  - {p.pin_code:<12} [{status_str}]")

    print(f"\nDemo Users ({len(users)}) [Password: demo123]:")
    for u in users:
        print(f"  - {u.email:<26} Role: {u.role:<10} Brand ID: {u.brand_id}")

    print(f"\nSubmissions ({len(subs)}):")
    for s in subs:
        print(f"  - '{s.campaign_name}' | Status: {s.status:<18} Score: {s.advisory_score}/100")
    print("=" * 68)


if __name__ == "__main__":
    seed_demo_data()
