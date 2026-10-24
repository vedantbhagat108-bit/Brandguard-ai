from typing import Optional
from fastapi import Header, HTTPException, Security, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .schemas import ConfidentialityLevel, UserRole

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
bearer_auth = HTTPBearer(auto_error=False)

# Role hierarchy and permissions
ROLE_PERMISSIONS: dict[UserRole, set[str]] = {
    "content_creator": {
        "content:submit",
        "content:analyze",
        "content:correct",
        "package:view",
        "package:apply_edits",
        "documents:read_public",
    },
    "manager": {
        "content:submit",
        "content:analyze",
        "content:correct",
        "package:view",
        "package:apply_edits",
        "workflow:review",
        "workflow:escalate",
        "workflow:comment",
        "documents:read",
        "analytics:view",
    },
    "authorised_reviewer": {
        "content:submit",
        "content:analyze",
        "content:correct",
        "package:view",
        "workflow:review",
        "workflow:approve",
        "workflow:reject",
        "documents:read",
        "documents:ingest",
        "guidelines:update",
        "analytics:view",
    },
    "admin": {
        "content:submit",
        "content:analyze",
        "content:correct",
        "package:view",
        "package:apply_edits",
        "workflow:review",
        "workflow:approve",
        "workflow:reject",
        "workflow:escalate",
        "documents:read",
        "documents:ingest",
        "documents:delete",
        "guidelines:update",
        "analytics:view",
        "admin:system",
    },
    "auditor": {
        "package:view",
        "documents:read",
        "analytics:view",
        "audit:read",
    },
}

CONFIDENTIALITY_ORDER: dict[ConfidentialityLevel, int] = {
    "public": 1,
    "internal": 2,
    "confidential": 3,
    "restricted": 4,
}


def can_access_confidentiality(user_clearance: ConfidentialityLevel, doc_confidentiality: ConfidentialityLevel) -> bool:
    """Verifies that user's clearance meets or exceeds the document's confidentiality classification."""
    user_level = CONFIDENTIALITY_ORDER.get(user_clearance, 1)
    doc_level = CONFIDENTIALITY_ORDER.get(doc_confidentiality, 2)
    return user_level >= doc_level


def check_permission(role: UserRole, permission: str) -> bool:
    """Checks whether the specified role has permission to execute the action."""
    perms = ROLE_PERMISSIONS.get(role, set())
    return permission in perms or "admin:system" in perms


async def authenticate_request(
    x_api_key: Optional[str] = Security(api_key_header),
    token: Optional[HTTPAuthorizationCredentials] = Security(bearer_auth),
) -> dict:
    """Authenticates API requests via X-API-Key or Bearer token."""
    # Allow development / demo mode if keys are default or not strictly configured
    if not settings.api_key:
        return {"authenticated": True, "actor": "developer", "role": "admin"}
    
    # Check X-API-Key header
    if x_api_key and x_api_key == settings.api_key:
        return {"authenticated": True, "actor": "api_client", "role": "admin"}
    
    # Check Bearer token
    if token and token.credentials == settings.api_key:
        return {"authenticated": True, "actor": "bearer_client", "role": "admin"}
        
    # In sandbox/demo environments, allow standard requests but assign default creator role
    return {"authenticated": True, "actor": "default_user", "role": "content_creator"}


def require_role(allowed_roles: list[UserRole]):
    """Decorator / dependency helper to assert caller role authorization."""
    async def role_checker(
        x_user_role: Optional[str] = Header("content_creator", alias="X-User-Role"),
    ):
        role: UserRole = x_user_role if x_user_role in ROLE_PERMISSIONS else "content_creator"
        if role not in allowed_roles and "admin" not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' is not authorized for this operation. Required: {allowed_roles}",
            )
        return role
    return role_checker
