import { ConfidentialityLevel, UserRole } from './types.ts';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  content_creator: ['content:submit', 'content:analyze', 'content:correct', 'package:view', 'package:apply_edits'],
  manager: ['content:submit', 'content:analyze', 'content:correct', 'package:view', 'workflow:review', 'workflow:escalate', 'workflow:comment', 'analytics:view'],
  authorised_reviewer: ['content:submit', 'content:analyze', 'content:correct', 'package:view', 'workflow:review', 'workflow:approve', 'workflow:reject', 'documents:ingest', 'analytics:view'],
  admin: ['content:submit', 'content:analyze', 'content:correct', 'package:view', 'workflow:review', 'workflow:approve', 'workflow:reject', 'workflow:escalate', 'documents:ingest', 'documents:delete', 'analytics:view', 'admin:system'],
  auditor: ['package:view', 'documents:read', 'analytics:view'],
};

const CONFIDENTIALITY_LEVELS: Record<ConfidentialityLevel, number> = {
  public: 1,
  internal: 2,
  confidential: 3,
  restricted: 4,
};

export function canAccessConfidentiality(userClearance: ConfidentialityLevel, docLevel: ConfidentialityLevel): boolean {
  return CONFIDENTIALITY_LEVELS[userClearance] >= CONFIDENTIALITY_LEVELS[docLevel];
}

export function hasPermission(role: UserRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(permission) || perms.includes('admin:system');
}
