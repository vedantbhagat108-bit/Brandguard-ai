import sys
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

# Ensure intra-package imports resolve cleanly
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from database import get_db
from models import BrandPin, AuditLog, User, default_pin_expiry
from security_deps import require_admin, validate_brand_access
from rate_limiter import pin_ip_limiter

router = APIRouter(prefix="/api/pins", tags=["BrandPIN"])


class GeneratePinRequest(BaseModel):
    brand_id: Optional[str] = Field(None, description="Optional target brand ID; defaults to admin's brand")
    prefix: Optional[str] = Field("PIN", description="Custom prefix for the generated PIN code")


class PinResponse(BaseModel):
    pin_code: str
    expires_at: str
    brand_id: str


class VerifyPinRequest(BaseModel):
    pin_code: str = Field(..., description="6-digit or prefixed PIN code")
    brand_id: str = Field(..., description="Target brand workspace UUID")
    user_email: EmailStr = Field(..., description="Creator email attempting redemption")


class VerifyPinResponse(BaseModel):
    success: bool
    message: str
    pin_code: str
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
    db: Session,
    request: Optional[Request] = None,
) -> BrandPin:
    """
    Validates single-use burnable PIN lifecycle:
      - Enforces IP-level sliding-window rate limit (5 tries / 5 mins).
      - Checks valid brand UUID format and record existence.
      - Tracks failed attempts; auto-locks PIN after 5 failed tries.
      - Throws HTTP 410 if already burned or expired (15m TTL).
      - Atomically burns the PIN with audit trail logging.
    """
    # 1. Door-guard: Client IP check
    if request:
        pin_ip_limiter.check_rate_limit(request)

    try:
        brand_uuid = uuid.UUID(str(brand_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid brand ID format."
        )

    clean_pin = pin_code.strip()
    now_utc = datetime.now(timezone.utc)

    # 2. Query PIN record
    pin = db.query(BrandPin).filter(
        BrandPin.pin_code == clean_pin,
        BrandPin.brand_id == brand_uuid
    ).first()

    # If PIN does not match, increment failure counter on latest active PIN
    if not pin:
        active_pin = (
            db.query(BrandPin)
            .filter(BrandPin.brand_id == brand_uuid, BrandPin.is_used == False)
            .order_by(BrandPin.created_at.desc())
            .first()
        )
        if active_pin:
            active_pin.failed_attempts += 1
            if active_pin.failed_attempts >= active_pin.max_attempts:
                active_pin.is_used = True
                active_pin.used_at = now_utc
                active_pin.burn_reason = "SECURITY_LOCKOUT"
                
                db.add(AuditLog(
                    brand_id=brand_uuid,
                    action="PIN_LOCKED",
                    details={
                        "reason": "Max attempts exceeded",
                        "client_ip": request.client.host if request and request.client else "unknown",
                    },
                    timestamp=now_utc,
                ))
            db.commit()

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid BrandPIN. PIN does not exist for this workspace."
        )

    # 3. Check if already burned
    if pin.is_used:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail=f"BrandPIN has already been used and is burned ({pin.burn_reason or 'REDEEMED'})."
        )

    # 4. Check if max failed attempts reached
    if pin.failed_attempts >= pin.max_attempts:
        pin.is_used = True
        pin.used_at = now_utc
        pin.burn_reason = "SECURITY_LOCKOUT"
        
        db.add(AuditLog(
            brand_id=brand_uuid,
            action="PIN_LOCKED",
            details={"email": user_email, "reason": "Max attempts exceeded on this PIN"},
            timestamp=now_utc,
        ))
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Maximum attempts exceeded. This BrandPIN is permanently invalidated."
        )

    # 5. Check 15-Minute Expiration (TTL)
    pin_expiry = pin.expires_at
    if pin_expiry.tzinfo is None:
        pin_expiry = pin_expiry.replace(tzinfo=timezone.utc)

    if pin_expiry < now_utc:
        pin.is_used = True
        pin.used_at = now_utc
        pin.burn_reason = "EXPIRED_TTL"
        
        db.add(AuditLog(
            brand_id=brand_uuid,
            action="PIN_BURNED",
            details={"reason": "TTL expired", "email": user_email},
            timestamp=now_utc,
        ))
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="BrandPIN has expired (15-minute validity exceeded). Request a fresh PIN."
        )

    # 6. Burn PIN atomically
    pin.is_used = True
    pin.used_by_email = user_email.strip().lower()
    pin.used_at = now_utc
    pin.burn_reason = "REDEEMED"

    # 7. Write immutable audit log
    db.add(AuditLog(
        brand_id=brand_uuid,
        action="PIN_VERIFIED",
        details={
            "pin_id": str(pin.id),
            "email": pin.used_by_email,
            "burn_reason": pin.burn_reason,
        },
        timestamp=now_utc,
    ))

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
    Generates a fresh single-use burnable PIN with 15-minute expiration.
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

    pin_code = generate_random_pin_code(prefix=prefix)
    now_utc = datetime.now(timezone.utc)
    expires_at = default_pin_expiry()

    new_pin = BrandPin(
        brand_id=target_brand_id,
        pin_code=pin_code,
        created_at=now_utc,
        expires_at=expires_at,
        is_used=False,
        failed_attempts=0,
        max_attempts=5,
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
        },
        timestamp=now_utc,
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(new_pin)

    return PinResponse(
        pin_code=new_pin.pin_code,
        expires_at=new_pin.expires_at.isoformat(),
        brand_id=str(new_pin.brand_id),
    )


@router.post("/verify", response_model=VerifyPinResponse)
def verify_pin_endpoint(
    payload: VerifyPinRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Public entry lobby endpoint for guest creators.
    Validates, applies IP rate limiting, checks 15m TTL, and burns the BrandPIN.
    """
    burned_pin = verify_and_burn_pin(
        pin_code=payload.pin_code,
        brand_id=payload.brand_id,
        user_email=payload.user_email,
        db=db,
        request=request,
    )

    return VerifyPinResponse(
        success=True,
        message="BrandPIN verified and burned successfully.",
        pin_code=burned_pin.pin_code,
        brand_id=str(burned_pin.brand_id),
    )
