import sys
import uuid
from pathlib import Path
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

# Ensure intra-package imports resolve cleanly
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from database import get_db
from models import User
from auth_handler import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Decodes the Bearer token, validates claims, and retrieves the active User record from DB.
    Raises HTTP 401 Unauthorized if token is invalid, expired, or user does not exist.
    """
    payload = decode_access_token(token)
    user_id_str: str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing user identifier (sub)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_uuid = uuid.UUID(str(user_id_str))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed user ID claim in token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with this token no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """RBAC Guard: Restricts endpoint access strictly to ADMIN users."""
    if user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Operation requires ADMIN role. Current role: {user.role}"
        )
    return user


def require_reviewer(user: User = Depends(get_current_user)) -> User:
    """RBAC Guard: Allows access to REVIEWER and ADMIN users."""
    if user.role not in ["ADMIN", "REVIEWER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Operation requires REVIEWER or ADMIN role. Current role: {user.role}"
        )
    return user


def require_creator(user: User = Depends(get_current_user)) -> User:
    """RBAC Guard: Allows access to CREATOR users."""
    if user.role != "CREATOR":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Operation requires CREATOR role. Current role: {user.role}"
        )
    return user


def validate_brand_access(user: User, resource_brand_id: str | uuid.UUID) -> None:
    """
    Enforces multi-tenant workspace isolation.
    Raises HTTP 403 Forbidden if user attempts cross-tenant resource access.
    """
    if str(user.brand_id) != str(resource_brand_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-tenant access forbidden. You cannot access resources from another brand workspace."
        )
