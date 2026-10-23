import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    Index,
)
from sqlalchemy.orm import relationship

# Ensure intra-package imports resolve cleanly in any execution context
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from database import Base, GUID


def utc_now() -> datetime:
    """Returns current UTC datetime with timezone awareness."""
    return datetime.now(timezone.utc)


def default_pin_expiry() -> datetime:
    """Calculates single-use PIN expiration: 24 hours from creation."""
    return datetime.now(timezone.utc) + timedelta(hours=24)


class BrandWorkspace(Base):
    """
    Tenant root table representing an isolated brand enterprise workspace.
    Every user, PIN, guideline, submission, and audit record belongs to a BrandWorkspace.
    """
    __tablename__ = "brand_workspaces"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Bidirectional Relationships with Cascade Delete
    pins = relationship("BrandPin", back_populates="brand", cascade="all, delete-orphan")
    users = relationship("User", back_populates="brand", cascade="all, delete-orphan")
    guidelines = relationship("BrandGuideline", back_populates="brand", cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="brand", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="brand", cascade="all, delete-orphan")


class BrandPin(Base):
    """
    Single-use burnable invitation and access PINs (OTP style).
    Once redeemed during user registration or workflow access, is_used is marked True
    and the redeeming email and timestamp are recorded.
    """
    __tablename__ = "brand_pins"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    brand_id = Column(GUID, ForeignKey("brand_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    pin_code = Column(String(64), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    expires_at = Column(DateTime(timezone=True), default=default_pin_expiry, nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
    used_by_email = Column(String(255), nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    brand = relationship("BrandWorkspace", back_populates="pins")


class User(Base):
    """
    Authenticated user within a brand workspace.
    Roles:
      - ADMIN: Full management over brand guidelines, PIN generation, and submissions.
      - REVIEWER: Content review, workflow decisions (approve/reject/request changes).
      - CREATOR: Submit drafts for evaluation and review feedback.
    """
    __tablename__ = "users"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False)  # "ADMIN", "REVIEWER", "CREATOR"
    brand_id = Column(GUID, ForeignKey("brand_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    brand = relationship("BrandWorkspace", back_populates="users")
    submissions = relationship("Submission", back_populates="creator", cascade="all, delete-orphan")


class BrandGuideline(Base):
    """
    Governance knowledge base chunk or policy rule.
    Categories include legal_marketing_policy, style_tone, product_facts, disclaimers.
    """
    __tablename__ = "brand_guidelines"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    brand_id = Column(GUID, ForeignKey("brand_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(64), default="legal_marketing_policy", nullable=False)
    content = Column(Text, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    brand = relationship("BrandWorkspace", back_populates="guidelines")

    __table_args__ = (
        Index("ix_brand_guidelines_brand_category", "brand_id", "category"),
    )


class Submission(Base):
    """
    Pre-publication candidate copy submitted for automated brand governance evaluation.
    Status lifecycle:
      PENDING_REVIEW -> APPROVED | CHANGES_REQUESTED | REJECTED
    """
    __tablename__ = "submissions"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    brand_id = Column(GUID, ForeignKey("brand_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    creator_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    campaign_name = Column(String(255), nullable=False)
    raw_content = Column(Text, nullable=False)
    status = Column(String(32), default="PENDING_REVIEW", nullable=False)
    advisory_score = Column(Integer, nullable=True)  # 0 to 100
    reviewer_comments = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    brand = relationship("BrandWorkspace", back_populates="submissions")
    creator = relationship("User", back_populates="submissions")
    findings = relationship("SubmissionFinding", back_populates="submission", cascade="all, delete-orphan")


class SubmissionFinding(Base):
    """
    Granular compliance or governance finding detected by the Governance Engine.
    Issue Types:
      - TONE_LANGUAGE, UNSUPPORTED_CLAIM, MESSAGING_CLAIM, MISSING_DISCLAIMER, KNOWLEDGE_GAP
    Severity:
      - LOW, MEDIUM, HIGH, CRITICAL
    """
    __tablename__ = "submission_findings"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    submission_id = Column(GUID, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    issue_type = Column(String(64), nullable=False)
    severity = Column(String(32), nullable=False)
    flagged_text = Column(Text, nullable=False)
    source_id = Column(String(255), nullable=False)  # Guideline UUID string or 'NONE'
    source_evidence = Column(Text, nullable=False)  # Exact quote from guideline or 'No matching record'
    explanation = Column(Text, nullable=False)
    suggested_edit = Column(Text, nullable=False)

    # Relationships
    submission = relationship("Submission", back_populates="findings")


class AuditLog(Base):
    """
    Immutable audit ledger for compliance, security tracking, and forensic traceability.
    Actions:
      - PIN_GENERATED: Single-use invitation PIN generated.
      - KB_INGESTED: Guideline uploaded or updated.
      - CONTENT_SUBMITTED: Draft submitted for evaluation.
      - STATUS_UPDATED: Workflow decision recorded.
    """
    __tablename__ = "audit_logs"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    brand_id = Column(GUID, ForeignKey("brand_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(GUID, nullable=True)
    action = Column(String(64), nullable=False)  # "PIN_GENERATED", "KB_INGESTED", "CONTENT_SUBMITTED", "STATUS_UPDATED"
    details = Column(JSON, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    brand = relationship("BrandWorkspace", back_populates="audit_logs")
