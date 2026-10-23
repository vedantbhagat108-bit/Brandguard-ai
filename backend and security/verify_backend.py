import sys
import io
import asyncio
from pathlib import Path
from starlette.testclient import TestClient
from fastapi import UploadFile

# Ensure intra-package imports resolve cleanly
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from main import app
from seed_data import seed_demo_data
from file_validator import process_and_validate_file
from schemas import ReviewResponse


def run_verification():
    """
    Automated end-to-end integration and security test suite verifying:
      1. Admin Authentication & JWT Generation
      2. Single-Use BrandPIN Generation (OTP style)
      3. Creator Registration with Valid PIN
      4. Single-Use PIN Burning (Re-use blocked with HTTP 403)
      5. RBAC Enforcement (Creator blocked from Admin route with HTTP 403)
      6. Safe Document Ingestion & Text Extraction
      7. Frontend Contract Parity: POST /api/reviews (HTTP 200 + Exact Schema)
      8. Frontend Contract Parity: GET /api/reviews (HTTP 200 + List[ReviewResponse])
    """
    print("=" * 68)
    print("  BrandLens AI - Automated Backend Security & Functional Verification")
    print("=" * 68)

    # Ensure baseline schema and demo data exist
    seed_demo_data()

    client = TestClient(app)
    checklist = []

    # ---------------------------------------------------------
    # Step 1: Admin Authentication
    # ---------------------------------------------------------
    print("\n[Step 1] Authenticating Admin user (admin@ecofresh.com)...")
    login_resp = client.post(
        "/api/auth/login",
        json={"email": "admin@ecofresh.com", "password": "demo123"}
    )
    assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
    login_data = login_resp.json()
    admin_token = login_data["access_token"]
    brand_id = login_data["user"]["brand_id"]
    print(f"  -> Success: Admin JWT issued. Brand ID: {brand_id}")
    checklist.append(("Admin Authentication (POST /api/auth/login)", True, "HTTP 200 - JWT issued"))

    # ---------------------------------------------------------
    # Step 2: Generate Fresh Single-Use BrandPIN
    # ---------------------------------------------------------
    print("\n[Step 2] Admin generating fresh single-use BrandPIN...")
    pin_resp = client.post(
        "/api/pins/generate",
        json={"brand_id": brand_id, "prefix": "TESTPIN"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert pin_resp.status_code == 201, f"PIN generation failed: {pin_resp.text}"
    pin_data = pin_resp.json()
    fresh_pin = pin_data["pin_code"]
    print(f"  -> Success: Generated {fresh_pin} (Expires: {pin_data['expires_at']})")
    checklist.append(("BrandPIN Issuance (POST /api/pins/generate)", True, f"HTTP 201 - Issued {fresh_pin}"))

    # ---------------------------------------------------------
    # Step 3: Register Creator Using Fresh PIN
    # ---------------------------------------------------------
    new_creator_email = f"verified_creator_{fresh_pin.lower()}@ecofresh.com"
    print(f"\n[Step 3] Registering Creator ({new_creator_email}) using {fresh_pin}...")
    reg_resp = client.post(
        "/api/auth/register",
        json={
            "email": new_creator_email,
            "password": "CreatorPassword123!",
            "brand_id": brand_id,
            "role": "CREATOR",
            "pin_code": fresh_pin
        }
    )
    assert reg_resp.status_code == 201, f"Creator registration failed: {reg_resp.text}"
    creator_token = reg_resp.json()["access_token"]
    print(f"  -> Success: Creator registered and authenticated.")
    checklist.append(("Creator Registration with PIN (POST /api/auth/register)", True, "HTTP 201 - Account created"))

    # ---------------------------------------------------------
    # Step 4: Attempt Re-Use of Burned PIN (OTP Burn Enforcement)
    # ---------------------------------------------------------
    print(f"\n[Step 4] Attempting second registration with the SAME burned PIN ({fresh_pin})...")
    burn_resp = client.post(
        "/api/auth/register",
        json={
            "email": "intruder@ecofresh.com",
            "password": "IntruderPassword123!",
            "brand_id": brand_id,
            "role": "CREATOR",
            "pin_code": fresh_pin
        }
    )
    assert burn_resp.status_code == 403, f"Expected 403 for burned PIN, got: {burn_resp.status_code}"
    error_detail = burn_resp.json().get("detail", "")
    assert "burned" in error_detail.lower(), f"Unexpected error detail: {error_detail}"
    print(f"  -> Success: Burned PIN correctly rejected with HTTP 403 ('{error_detail}')")
    checklist.append(("Single-Use PIN / OTP Burning Defense", True, "HTTP 403 - Burned PIN rejected"))

    # ---------------------------------------------------------
    # Step 5: Test RBAC Guards (Creator cannot generate PINs)
    # ---------------------------------------------------------
    print("\n[Step 5] Creator attempting admin-only PIN generation (RBAC check)...")
    unauthorized_resp = client.post(
        "/api/pins/generate",
        json={},
        headers={"Authorization": f"Bearer {creator_token}"}
    )
    assert unauthorized_resp.status_code == 403, f"Expected 403 for Creator on Admin route, got: {unauthorized_resp.status_code}"
    rbac_detail = unauthorized_resp.json().get("detail", "")
    assert "ADMIN" in rbac_detail, f"Unexpected RBAC error message: {rbac_detail}"
    print(f"  -> Success: Creator blocked with HTTP 403 ('{rbac_detail}')")
    checklist.append(("RBAC Enforcement (Creator blocked from Admin route)", True, "HTTP 403 - Role restricted"))

    # ---------------------------------------------------------
    # Step 6: Test Safe File Ingestion Validator
    # ---------------------------------------------------------
    print("\n[Step 6] Testing File Ingestion & Extraction...")
    sample_text = "BrandLens AI Compliance Rule: Zero tolerance for unsupported medical claims."
    dummy_file = UploadFile(
        filename="guidelines.txt",
        file=io.BytesIO(sample_text.encode("utf-8"))
    )
    extracted = asyncio.run(process_and_validate_file(dummy_file))
    assert extracted == sample_text, f"Extracted text mismatch: {extracted}"
    print(f"  -> Success: Extracted {len(extracted)} characters cleanly from simulated file.")
    checklist.append(("Document Ingestion & File Validation", True, "Pass - Text parsed & validated"))

    # ---------------------------------------------------------
    # Step 7: Frontend Contract Parity - POST /api/reviews
    # ---------------------------------------------------------
    print("\n[Step 7] Testing POST /api/reviews (Frontend Contract 100% Parity)...")
    review_payload = {
        "title": "Summer Botanical Drops Launch",
        "channel": "Instagram",
        "content": "Our new herbal drops are a 100% guarantee cure for sluggish metabolism and fatigue!",
        "isPaidPartnership": True,
        "submittedBy": "Morgan Taylor",
        "sourceFileName": "drops_launch_copy.txt"
    }
    review_resp = client.post("/api/reviews", json=review_payload)
    assert review_resp.status_code == 200, f"POST /api/reviews failed with status {review_resp.status_code}: {review_resp.text}"

    review_data = review_resp.json()
    # Validate Pydantic model serialization matches ReviewResponse
    validated_review = ReviewResponse.model_validate(review_data)

    assert validated_review.title == "Summer Botanical Drops Launch"
    assert validated_review.channel == "Instagram"
    assert validated_review.isPaidPartnership is True
    assert validated_review.submittedBy == "Morgan Taylor"
    assert validated_review.score < 60, f"Expected penalized score, got {validated_review.score}"
    assert len(validated_review.findings) >= 2, f"Expected >= 2 findings, got {len(validated_review.findings)}"

    # Validate granular finding structure for frontend components
    for f in validated_review.findings:
        assert f.evidence, "Finding must have non-empty evidence"
        assert f.explanation, "Finding must have non-empty explanation"
        assert f.suggestedFix, "Finding must have non-empty suggestedFix"
        assert f.source.sourceId, "Finding source must have sourceId"
        assert f.source.title, "Finding source must have title"
        assert f.source.quote, "Finding source must have quote"
        # Validate character slice consistency
        if f.start < len(validated_review.content) and f.end <= len(validated_review.content) and f.start < f.end:
            assert validated_review.content[f.start:f.end] == f.evidence, "Offset slice mismatch"

    print(f"  -> Success: Review generated (ID: {validated_review.id}, Score: {validated_review.score}/100, Findings: {len(validated_review.findings)})")
    checklist.append(("Review Submission (POST /api/reviews)", True, f"HTTP 200 - ReviewResponse schema verified"))

    # ---------------------------------------------------------
    # Step 8: Frontend Contract Parity - GET /api/reviews
    # ---------------------------------------------------------
    print("\n[Step 8] Testing GET /api/reviews (Review list retrieval)...")
    list_resp = client.get("/api/reviews")
    assert list_resp.status_code == 200, f"GET /api/reviews failed: {list_resp.text}"
    reviews_list = list_resp.json()
    assert isinstance(reviews_list, list)
    assert len(reviews_list) >= 1, "Review list should not be empty"
    print(f"  -> Success: Retrieved {len(reviews_list)} reviews matching frontend contract.")
    checklist.append(("Review List Retrieval (GET /api/reviews)", True, f"HTTP 200 - {len(reviews_list)} reviews fetched"))

    # ---------------------------------------------------------
    # Final Summary Checklist
    # ---------------------------------------------------------
    print("\n" + "=" * 68)
    print("  VERIFICATION AUDIT REPORT")
    print("=" * 68)
    for title, passed, note in checklist:
        status_symbol = "[PASS]" if passed else "[FAIL]"
        print(f"  {status_symbol:<8} {title:<52} | {note}")
    print("=" * 68)
    print("  ALL ARCHITECTURAL & SECURITY ASSERTS PASSED SUCCESSFULLY.")
    print("=" * 68)


if __name__ == "__main__":
    run_verification()
