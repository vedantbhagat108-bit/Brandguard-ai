from datetime import datetime
from typing import Optional
from fastapi import HTTPException

from .review_package import get_package, save_package
from .schemas import (
    ChangeHistoryEntry,
    WorkflowActionRequest,
    WorkflowActionResponse,
    WorkflowStatus,
)


def apply_workflow_action(req: WorkflowActionRequest) -> WorkflowActionResponse:
    """Processes stage transitions in the Review & Approval Workflow:

    Creator -> Manager -> Authorised Reviewer -> Published/Approved
    """
    pkg = get_package(req.package_id)
    if not pkg:
        raise HTTPException(status_code=404, detail=f"Review package '{req.package_id}' not found")

    now = datetime.utcnow().isoformat()
    action = req.action
    role = req.actor_role
    notes = req.notes or ""

    # State machine validation
    current_status = pkg.workflow_status
    new_status: WorkflowStatus = current_status
    message = ""

    if action == "approve":
        if role == "manager":
            # Manager approves -> moves to Authorised Reviewer
            new_status = "pending_reviewer"
            message = "Approved by Manager. Escalated to Authorised Reviewer for publication sign-off."
        elif role in ("authorised_reviewer", "admin"):
            new_status = "approved"
            message = "Approved for publication by Authorised Reviewer."
        else:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{role}' cannot approve review package.",
            )

    elif action == "reject":
        if role in ("manager", "authorised_reviewer", "admin"):
            new_status = "rejected"
            message = f"Rejected by {role.replace('_', ' ').title()}. Sent back to Content Creator."
        else:
            raise HTTPException(status_code=403, detail=f"Role '{role}' cannot reject review package.")

    elif action == "escalate":
        new_status = "escalated"
        message = f"Escalated to senior legal / brand executive: {notes}"

    elif action == "comment":
        message = f"Comment added by {req.actor_id} ({role}): {notes}"

    elif action == "apply_edits":
        if req.edited_content:
            pkg.content_raw = req.edited_content
            new_status = "pending_manager"
            message = "Applied suggested edits. Submitted for re-review."
        else:
            message = "No edit content supplied."

    # Record in change history
    entry = ChangeHistoryEntry(
        timestamp=now,
        action=f"WORKFLOW_{action.upper()}",
        actor=req.actor_id,
        actor_role=role,
        notes=f"{message} | Notes: {notes}",
    )
    pkg.change_history.append(entry)
    pkg.workflow_status = new_status
    save_package(pkg)

    return WorkflowActionResponse(
        package_id=pkg.package_id,
        status=new_status,
        message=message,
        updated_at=now,
        change_history=pkg.change_history,
    )
