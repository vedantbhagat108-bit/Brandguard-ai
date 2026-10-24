import sys
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Ensure intra-package imports resolve cleanly
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from database import get_db
from models import BrandPin, AuditLog, User, default_pin_expiry
from security_deps import require_admin, validate_brand_access

router = APIRouter(prefix="/api/pins", tags=["BrandPIN"])


class GeneratePinRequest(BaseModel):
    brand_id: Optional[str] = Field(None, description="Optional target brand ID; defaults to admin's brand")
    prefix: Optional[str] = Field("PIN", description="Custom prefix for the generated PIN code")


class PinResponse(BaseModel):
    pin_code: str
    expires_at: str
    brand_id: str


def generate_random_pin_code(prefix: str = "PIN") -> str:
    """Generates an OTP-style random PIN code, e.g. 'PIN-948215'."""
    random_num = secrets.randbelow(900000) + 100000
    clean_prefix = (prefix or "PIN").strip().upper()
    return f"{clean_prefix}-{random_num}"


def verify_and_burn_pin(
    pin_code: str,
    brand_id: str,
    user_email: str,
    db: Session
) -> BrandPin:
    """
    Validates single-use burnable PIN lifecycle:
      - Validates existence and brand association.
      - Throws HTTP 403 if already used (burned).
      - Throws HTTP 403 if expired.
      - Burns the PIN: marks is_used=True, logs used_by_email and used_at.
      - Commits transaction and returns the burned BrandPin record.
    """
    try:
        brand_uuid = uuid.UUID(str(brand_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid brand ID format."
        )

    clean_pin = pin_code.strip()
    pin = db.query(BrandPin).filter(
        BrandPin.pin_code == clean_pin,
        BrandPin.brand_id == brand_uuid
    ).first()

    if not pin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid BrandPIN. PIN does not exist for this workspace."
        )

    if pin.is_used:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="BrandPIN has already been used and is burned. Request a fresh PIN."
        )

    now_utc = datetime.now(timezone.utc)
    # Handle timezone-aware comparison
    pin_expiry = pin.expires_at
    if pin_expiry.tzinfo is None:
        pin_expiry = pin_expiry.replace(tzinfo=timezone.utc)

    if pin_expiry < now_utc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="BrandPIN has expired. Request a fresh PIN."
        )

    # Burn PIN
    pin.is_used = True
    pin.used_by_email = user_email.strip().lower()
    pin.used_at = now_utc
    db.commit()
    db.refresh(pin)
    return pin


@router.post("/generate", response_model=PinResponse, status_code=status.HTTP_201_CREATED)
def generate_pin(
    payload: Optional[GeneratePinRequest] = None,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Generates a fresh single-use burnable PIN with 24-hour expiration.
    Protected strictly by ADMIN role. Logs an audit trail event upon issuance.
    """
    target_brand_id = current_admin.brand_id
    prefix = "PIN"
    if payload:
        if payload.brand_id:
            validate_brand_access(current_admin, payload.brand_id)
            target_brand_id = uuid.UUID(str(payload.brand_id))
        if payload.prefix:
            prefix = payload.prefix

    # Generate unique PIN code
    pin_code = generate_random_pin_code(prefix=prefix)

    new_pin = BrandPin(
        brand_id=target_brand_id,
        pin_code=pin_code,
        expires_at=default_pin_expiry(),
        is_used=False,
    )
    db.add(new_pin)
    db.flush()

    # Log immutable audit event
    audit_entry = AuditLog(
        brand_id=target_brand_id,
        user_id=current_admin.id,
        action="PIN_GENERATED",
        details={
            "pin_id": str(new_pin.id),
            "pin_code": new_pin.pin_code,
            "generated_by": current_admin.email,
            "expires_at": new_pin.expires_at.isoformat(),
        }
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(new_pin)

    return PinResponse(
        pin_code=new_pin.pin_code,
        expires_at=new_pin.expires_at.isoformat(),
        brand_id=str(new_pin.brand_id),
    )
