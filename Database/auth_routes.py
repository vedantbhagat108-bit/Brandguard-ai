import sys
import uuid
from pathlib import Path
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

# Ensure intra-package imports resolve cleanly
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from database import get_db
from models import User, BrandWorkspace
from auth_handler import hash_password, verify_password, create_access_token
from security_deps import get_current_user
from pin_routes import verify_and_burn_pin

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class UserRegisterRequest(BaseModel):
    email: EmailStr = Field(..., description="User corporate or creator email")
    password: str = Field(..., min_length=6, description="Password (min 6 chars)")
    brand_id: str = Field(..., description="Target brand workspace UUID")
    role: Literal["ADMIN", "REVIEWER", "CREATOR"] = Field("CREATOR", description="Assigned role")
    pin_code: Optional[str] = Field(None, description="Single-use BrandPIN (required for CREATOR registration)")


class UserLoginRequest(BaseModel):
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., description="Plaintext password")


class CreatorLobbyLoginRequest(BaseModel):
    brand_id: str = Field(..., description="Target brand workspace UUID")
    pin_code: str = Field(..., description="Single-use BrandPIN")
    email: EmailStr = Field(..., description="Creator email address")


class UserProfileResponse(BaseModel):
    id: str
    email: str
    role: str
    brand_id: str


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfileResponse


@router.post("/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: UserRegisterRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Registers a new user within a brand workspace.
    For CREATOR roles, enforces IP rate limiting, checks 15m TTL/attempts, and burns a single-use BrandPIN.
    """
    normalized_email = payload.email.strip().lower()

    # Verify brand workspace existence
    try:
        brand_uuid = uuid.UUID(str(payload.brand_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid brand ID format."
        )

    workspace = db.query(BrandWorkspace).filter(BrandWorkspace.id == brand_uuid).first()
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Brand workspace not found."
        )

    # Check for duplicate email
    existing_user = db.query(User).filter(User.email == normalized_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered."
        )

    # For CREATOR role, single-use PIN is mandatory and must be verified and burned
    if payload.role == "CREATOR":
        if not payload.pin_code or not payload.pin_code.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A valid single-use pin_code is required for CREATOR registration."
            )
        # Verifies existence, expiration (15m), checks IP rate limit, burns PIN, and logs audit
        verify_and_burn_pin(
            pin_code=payload.pin_code,
            brand_id=str(workspace.id),
            user_email=normalized_email,
            db=db,
            request=request,
        )

    # Create user
    new_user = User(
        id=uuid.uuid4(),
        email=normalized_email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        brand_id=workspace.id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Issue JWT token
    token = create_access_token({
        "sub": str(new_user.id),
        "email": new_user.email,
        "role": new_user.role,
        "brand_id": str(new_user.brand_id)
    })

    return AuthTokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserProfileResponse(
            id=str(new_user.id),
            email=new_user.email,
            role=new_user.role,
            brand_id=str(new_user.brand_id)
        )
    )


@router.post("/lobby-login", response_model=AuthTokenResponse)
def creator_lobby_login(
    payload: CreatorLobbyLoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Public entry lobby endpoint for guest creators.
    Enforces IP rate limit, checks 15m TTL and failed attempts, burns PIN,
    and returns a short-lived Creator JWT token without requiring a permanent password.
    """
    normalized_email = payload.email.strip().lower()

    # 1. Verify and burn the single-use PIN
    burned_pin = verify_and_burn_pin(
        pin_code=payload.pin_code,
        brand_id=payload.brand_id,
        user_email=normalized_email,
        db=db,
        request=request,
    )

    # 2. Look up or auto-provision the creator account for foreign-key tracking
    creator = db.query(User).filter(
        User.email == normalized_email,
        User.brand_id == burned_pin.brand_id
    ).first()

    if not creator:
        creator = User(
            id=uuid.uuid4(),
            email=normalized_email,
            hashed_password=hash_password(uuid.uuid4().hex),  # Random unusable hash for guest
            role="CREATOR",
            brand_id=burned_pin.brand_id,
        )
        db.add(creator)
        db.commit()
        db.refresh(creator)

    # 3. Issue guest access token
    token = create_access_token({
        "sub": str(creator.id),
        "email": creator.email,
        "role": "CREATOR",
        "brand_id": str(creator.brand_id),
        "pin_id": str(burned_pin.id),
    })

    return AuthTokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserProfileResponse(
            id=str(creator.id),
            email=creator.email,
            role=creator.role,
            brand_id=str(creator.brand_id)
        )
    )


@router.post("/login", response_model=AuthTokenResponse)
def login(
    payload: UserLoginRequest,
    db: Session = Depends(get_db)
):
    """
    Authenticates user with email and password, returning an encrypted JWT bearer token.
    """
    normalized_email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "brand_id": str(user.brand_id)
    })

    return AuthTokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserProfileResponse(
            id=str(user.id),
            email=user.email,
            role=user.role,
            brand_id=str(user.brand_id)
        )
    )


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Retrieves authenticated profile of the current active user."""
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role,
        "brand_id": str(current_user.brand_id),
        "created_at": current_user.created_at.isoformat()
    }
