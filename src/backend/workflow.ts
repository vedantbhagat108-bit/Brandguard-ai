import { ChangeHistoryEntry, UserRole, WorkflowStatus } from './types.ts';
import { getPackage, savePackage } from './reviewPackage.ts';

export interface WorkflowActionRequest {
  package_id: string;
  action: 'approve' | 'reject' | 'escalate' | 'comment' | 'apply_edits';
  actor_id: string;
  actor_role: UserRole;
  notes?: string;
  edited_content?: string;
}

export interface WorkflowActionResponse {
  package_id: string;
  status: WorkflowStatus;
  message: string;
  updated_at: string;
  change_history: ChangeHistoryEntry[];
}

export function handleWorkflowAction(req: WorkflowActionRequest): WorkflowActionResponse {
  const pkg = getPackage(req.package_id);
  if (!pkg) {
    throw new Error(`Review package "${req.package_id}" not found.`);
  }

  const now = new Date().toISOString();
  let newStatus: WorkflowStatus = pkg.workflow_status;
  let message = '';

  if (req.action === 'approve') {
    if (req.actor_role === 'manager') {
      newStatus = 'pending_reviewer';
      message = 'Manager approved. Handed off to Authorised Reviewer for publication clearance.';
    } else if (req.actor_role === 'authorised_reviewer' || req.actor_role === 'admin') {
      newStatus = 'approved';
      message = 'Authorised Reviewer approved. Content certified for publication.';
    } else {
      throw new Error(`Role "${req.actor_role}" is not authorized to approve packages.`);
    }
  } else if (req.action === 'reject') {
    newStatus = 'rejected';
    message = `Rejected by ${req.actor_role.replace('_', ' ')}. Returned to Content Creator with revisions requested.`;
  } else if (req.action === 'escalate') {
    newStatus = 'escalated';
    message = `Escalated to senior brand leadership/legal: ${req.notes || ''}`;
  } else if (req.action === 'comment') {
    message = `Comment logged by ${req.actor_id} (${req.actor_role}): ${req.notes || ''}`;
  } else if (req.action === 'apply_edits') {
    if (req.edited_content) {
      pkg.content_raw = req.edited_content;
      newStatus = 'pending_manager';
      message = 'Content Creator applied suggested edits and resubmitted for manager review.';
    }
  }

  const entry: ChangeHistoryEntry = {
    timestamp: now,
    action: `WORKFLOW_${req.action.toUpperCase()}`,
    actor: req.actor_id,
    actor_role: req.actor_role,
    notes: `${message} ${req.notes ? `| Note: ${req.notes}` : ''}`,
  };

  pkg.change_history.push(entry);
  pkg.workflow_status = newStatus;
  savePackage(pkg);

  return {
    package_id: pkg.package_id,
    status: newStatus,
    message,
    updated_at: now,
    change_history: pkg.change_history,
  };
}
