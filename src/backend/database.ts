import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { store } from './store.ts';

export type DBRole = 'SUPER_ADMIN' | 'ADMIN' | 'REVIEWER' | 'CREATOR';

export interface BrandWorkspaceRecord {
  id: string;
  name: string;
  brand_name: string;
  created_at: string;
}

export interface BrandPinRecord {
  id: string;
  brand_id: string;
  brand_name: string;
  pin_code: string;
  created_by_id?: string;
  created_by_email?: string;
  created_at: string;
  expires_at: string;
  is_used: boolean;
  used_by_email: string | null;
  used_at: string | null;
}

export interface DBUserRecord {
  id: string;
  username: string;
  email: string;
  hashed_password: string;
  role: DBRole;
  brand_id: string;
  brand_name?: string;
  name: string;
  department: string;
  is_approved: boolean;
  lobby_access: boolean;
  created_at: string;
  password_updated_at?: string;
  requested_role?: 'ADMIN' | 'REVIEWER' | 'CREATOR' | null;
  role_request_status?: 'pending' | 'approved' | 'rejected' | null;
  role_request_note?: string | null;
  role_request_at?: string | null;
}

export interface BrandGuidelineRecord {
  id: string;
  brand_id: string;
  title: string;
  category: 'legal_marketing_policy' | 'disclaimers' | 'style_tone' | 'product_facts';
  content: string;
  version: number;
  created_at: string;
}

export interface SubmissionFindingRecord {
  id: string;
  submission_id: string;
  issue_type: 'TONE_LANGUAGE' | 'UNSUPPORTED_CLAIM' | 'MESSAGING_CLAIM' | 'MISSING_DISCLAIMER' | 'KNOWLEDGE_GAP';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  flagged_text: string;
  source_id: string;
  source_evidence: string;
  explanation: string;
  suggested_edit: string;
}

export interface SubmissionRecord {
  id: string;
  brand_id: string;
  creator_id: string;
  campaign_name: string;
  raw_content: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
  advisory_score: number;
  reviewer_comments: string | null;
  created_at: string;
  findings: SubmissionFindingRecord[];
}

export interface AuditLogRecord {
  id: string;
  brand_id: string;
  user_id: string | null;
  user_email: string;
  ip_address: string;
  action:
    | 'PIN_GENERATED'
    | 'PIN_BURNED'
    | 'KB_INGESTED'
    | 'CONTENT_SUBMITTED'
    | 'STATUS_UPDATED'
    | 'USER_REGISTERED'
    | 'USER_LOGIN'
    | 'PASSWORD_RESET'
    | 'OTP_VERIFIED'
    | 'LOBBY_CREATED'
    | 'LOBBY_JOINED'
    | 'LOBBY_APPROVED'
    | 'ROLE_UPDATED'
    | 'ROLE_CHANGE_REQUESTED'
    | 'LOBBY_ACCESS_UPDATED'
    | 'GMAIL_OTP_SENT'
    | 'VISUAL_ASSET_UPLOADED'
    | 'VISUAL_ASSET_APPROVED'
    | 'VISUAL_ASSET_REJECTED'
    | 'VISUAL_ASSET_ARCHIVED'
    | 'VISUAL_ASSET_VERSIONED'
    | 'VISUAL_ASSET_DELETED'
    | 'VISUAL_REVIEW_COMPLETED'
    | 'USER_ACCOUNT_DELETED'
    | 'PROFILE_UPDATED'
    | 'HISTORY_CLEARED';
  details: Record<string, any>;
  details_text: string;
  timestamp: string;
}

const JWT_SECRET = process.env.JWT_SECRET_KEY || 'brandlens-ai-secure-secret-key-change-in-production-2026';

const LEGACY_DEMO_USER_IDS = new Set([
  'u0000001-0000-4000-8000-000000000001',
  'u0000002-0000-4000-8000-000000000002',
  'u0000003-0000-4000-8000-000000000003',
  'manager-1',
  'creator-1',
  'creator-new',
]);

const LEGACY_DEMO_PINS = new Set(['ECO-8821', 'NOVA-4410', 'AUR-9920', 'ECO-0019']);

export function hashPassword(password: string): string {
  const salt = 'brandlens_salt_2026';
  return crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
}

export function verifyPassword(plain: string, hashed: string): boolean {
  return hashPassword(plain) === hashed;
}

export function createAccessToken(payload: {
  sub: string;
  username?: string;
  email: string;
  role: DBRole;
  brand_id: string;
}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function decodeAccessToken(token: string): {
  sub: string;
  username?: string;
  email: string;
  role: DBRole;
  brand_id: string;
  exp: number;
} {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Could not validate authentication credentials or token is malformed');
  }
  const [header, body, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  if (sig !== expectedSig) {
    throw new Error('Invalid token signature');
  }
  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!decoded.sub || (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000))) {
    throw new Error('Token has expired');
  }
  return decoded;
}

function formatDetailsText(action: string, details: Record<string, any>): string {
  if (!details || typeof details !== 'object') return String(details || action);
  if (details.summary && typeof details.summary === 'string') return details.summary;
  const parts = Object.entries(details)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  return parts.length > 0 ? parts.join(' · ') : action;
}

export class MultiTenantSecurityDB {
  public workspaces = new Map<string, BrandWorkspaceRecord>();
  public pins = new Map<string, BrandPinRecord>();
  public users = new Map<string, DBUserRecord>();
  public guidelines = new Map<string, BrandGuidelineRecord>();
  public submissions = new Map<string, SubmissionRecord>();
  public auditLogs: AuditLogRecord[] = [];
  public deletedUserEmails = new Set<string>();

  constructor() {
    this.seedWorkspacesAndGuidelines();
  }

  public seedWorkspacesAndGuidelines() {
    if (this.workspaces.size > 0) return;

    const now = new Date().toISOString();

    const brandGlobal: BrandWorkspaceRecord = {
      id: 'b0000000-0000-4000-8000-000000000000',
      name: 'Global Governance',
      brand_name: 'Global Governance',
      created_at: now,
    };
    const brandDefault: BrandWorkspaceRecord = {
      id: 'b0000001-0000-4000-8000-000000000001',
      name: 'Default Workspace',
      brand_name: 'Default Workspace',
      created_at: now,
    };

    this.workspaces.set(brandGlobal.id, brandGlobal);
    this.workspaces.set(brandDefault.id, brandDefault);
  }

  public purgeLegacyDemoRecords() {
    for (const demoId of LEGACY_DEMO_USER_IDS) {
      this.users.delete(demoId);
    }
    for (const demoPin of LEGACY_DEMO_PINS) {
      this.pins.delete(demoPin);
    }
    this.guidelines.delete('g0000001-0000-4000-8000-000000000001');
    this.guidelines.delete('g0000002-0000-4000-8000-000000000002');
    this.guidelines.delete('g0000003-0000-4000-8000-000000000003');
    for (const u of this.users.values()) {
      if (typeof u.lobby_access !== 'boolean') {
        u.lobby_access =
          u.role === 'SUPER_ADMIN' ||
          u.role === 'ADMIN' ||
          u.role === 'REVIEWER' ||
          Boolean(u.is_approved);
      }
    }
    this.seedInitialAccounts();
  }

  public ensureSuperAdminAccount() {
    const superAdminId = 'u0000000-super-admin';
    const superAdminEmail = 'admin@gmail.com';
    const existing =
      this.users.get(superAdminId) ||
      this.findUserByEmail(superAdminEmail);

    const now = new Date().toISOString();
    const superAdminRecord: DBUserRecord = {
      id: existing?.id || superAdminId,
      username: 'admin@gmail.com',
      email: superAdminEmail,
      hashed_password: existing?.password_updated_at
        ? existing.hashed_password
        : hashPassword('Ashu@12'),
      role: 'SUPER_ADMIN',
      brand_id: 'b0000000-0000-4000-8000-000000000000',
      brand_name: 'Global Governance',
      name: existing?.name || 'Super Admin',
      department: existing?.department || 'Platform Governance',
      is_approved: true,
      lobby_access: true,
      created_at: existing?.created_at || now,
      password_updated_at: existing?.password_updated_at,
    };
    this.users.set(superAdminRecord.id, superAdminRecord);
  }

  public seedInitialAccounts() {
    this.ensureSuperAdminAccount();

    const defaultBrandId = 'b0000001-0000-4000-8000-000000000001';
    const defaultBrandName = 'Default Workspace';
    const now = new Date().toISOString();

    // Ensure demo account exists (preserves role if already set, e.g. ADMIN)
    const demoDeleted = this.deletedUserEmails.has('demo@t1.in') || this.deletedUserEmails.has('demo');
    const existingDemo = this.findUserByEmail('demo@t1.in') || this.findUserByUsername('demo');
    if (!existingDemo && !demoDeleted) {
      const demoUser: DBUserRecord = {
        id: 'u_demo_t1',
        username: 'demo',
        email: 'demo@t1.in',
        hashed_password: hashPassword('demo123'),
        role: 'ADMIN',
        brand_id: defaultBrandId,
        brand_name: defaultBrandName,
        name: 'demo',
        department: 'Marketing',
        is_approved: true,
        lobby_access: true,
        created_at: now,
      };
      this.users.set(demoUser.id, demoUser);
    }

    // Ensure demo creator account exists
    const creatorDeleted =
      this.deletedUserEmails.has('demo@gmail.com') ||
      this.deletedUserEmails.has('democreator');
    const existingCreator =
      this.findUserByEmail('demo@gmail.com') ||
      this.findUserByUsername('democreator');
    if (!existingCreator && !creatorDeleted) {
      const creatorUser: DBUserRecord = {
        id: 'u_demo_creator',
        username: 'democreator',
        email: 'demo@gmail.com',
        hashed_password: hashPassword('password123'),
        role: 'CREATOR',
        brand_id: defaultBrandId,
        brand_name: defaultBrandName,
        name: 'Demo Creator',
        department: 'Marketing',
        is_approved: true,
        lobby_access: true,
        created_at: now,
      };
      this.users.set(creatorUser.id, creatorUser);
    }

    // Ensure demo workspace admin account exists (role: ADMIN, NOT SUPER_ADMIN)
    const adminDeleted =
      this.deletedUserEmails.has('demoadmin@gmail.com') ||
      this.deletedUserEmails.has('demoadmin');
    const existingAdmin =
      this.findUserByEmail('demoadmin@gmail.com') ||
      this.findUserByUsername('demoadmin');
    if (!existingAdmin && !adminDeleted) {
      const adminUser: DBUserRecord = {
        id: 'u_demo_admin',
        username: 'demoadmin',
        email: 'demoadmin@gmail.com',
        hashed_password: hashPassword('password123'),
        role: 'ADMIN',
        brand_id: defaultBrandId,
        brand_name: defaultBrandName,
        name: 'Demo Admin',
        department: 'Compliance',
        is_approved: true,
        lobby_access: true,
        created_at: now,
      };
      this.users.set(adminUser.id, adminUser);
    }
  }

  public getOrCreateWorkspaceByName(
    workspaceName?: string,
    brandId?: string
  ): BrandWorkspaceRecord {
    const cleanName = (workspaceName || '').trim();
    if (cleanName) {
      for (const ws of this.workspaces.values()) {
        if (ws.name.toLowerCase() === cleanName.toLowerCase()) {
          return ws;
        }
      }
      const now = new Date().toISOString();
      const newWs: BrandWorkspaceRecord = {
        id: `ws_${crypto.randomUUID()}`,
        name: cleanName,
        brand_name: cleanName,
        created_at: now,
      };
      this.workspaces.set(newWs.id, newWs);
      this.saveToDisk();
      return newWs;
    }

    if (brandId && this.workspaces.has(brandId)) {
      return this.workspaces.get(brandId)!;
    }

    return (
      this.workspaces.get('b0000001-0000-4000-8000-000000000001') ||
      Array.from(this.workspaces.values())[0]
    );
  }

  public findUserByIdOrIdentifier(identifier: string): DBUserRecord | undefined {
    const clean = (identifier || '').trim();
    if (!clean) return undefined;
    if (this.deletedUserEmails.has(clean.toLowerCase())) return undefined;
    const byId = this.users.get(clean);
    if (byId) return byId;
    return this.findUserByUsernameOrEmail(clean);
  }

  public findUserByEmail(email: string): DBUserRecord | undefined {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) return undefined;
    if (this.deletedUserEmails.has(clean)) return undefined;
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === clean) return u;
    }
    return undefined;
  }

  public findUserByUsername(username: string): DBUserRecord | undefined {
    const clean = (username || '').trim().toLowerCase();
    if (!clean) return undefined;
    if (this.deletedUserEmails.has(clean)) return undefined;
    for (const u of this.users.values()) {
      if (
        u.username.toLowerCase() === clean ||
        (u.email.toLowerCase() === 'admin@gmail.com' && clean === 'admin')
      ) {
        return u;
      }
    }
    return undefined;
  }

  public findUserByUsernameOrEmail(identifier: string): DBUserRecord | undefined {
    const clean = (identifier || '').trim().toLowerCase();
    if (!clean) return undefined;
    if (this.deletedUserEmails.has(clean)) return undefined;
    for (const u of this.users.values()) {
      if (
        u.email.toLowerCase() === clean ||
        u.username.toLowerCase() === clean ||
        (u.email.toLowerCase() === 'admin@gmail.com' && clean === 'admin')
      ) {
        return u;
      }
    }
    return undefined;
  }

  public updateUserRole(params: {
    actorId: string;
    actorRole?: string;
    targetIdentifier: string;
    newRole: DBRole;
  }): DBUserRecord {
    this.loadFromDisk();
    const actor = this.findUserByIdOrIdentifier(params.actorId);
    const effectiveActorRole = (actor?.role || params.actorRole || 'ADMIN').toUpperCase();
    const actorEmail = (actor?.email || '').toLowerCase();
    const isSuperOrAdmin =
      actorEmail === 'admin@gmail.com' ||
      effectiveActorRole === 'SUPER_ADMIN' ||
      effectiveActorRole === 'ADMIN' ||
      params.actorRole === 'SUPER_ADMIN' ||
      params.actorRole === 'ADMIN';

    if (!isSuperOrAdmin) {
      const err: any = new Error('Forbidden: Only an Admin or Super Admin has the right to promote or change user roles.');
      err.status = 403;
      throw err;
    }

    const target = this.findUserByIdOrIdentifier(params.targetIdentifier);
    if (!target) {
      const err: any = new Error(`Target user "${params.targetIdentifier}" not found.`);
      err.status = 404;
      throw err;
    }

    const previousRole = target.role;
    if (target.email.toLowerCase() === 'admin@gmail.com') {
      target.role = 'SUPER_ADMIN';
    } else {
      target.role = params.newRole;
    }
    target.is_approved = true;
    target.lobby_access = true;
    target.requested_role = null;
    target.role_request_status = 'approved';
    this.users.set(target.id, target);
    this.saveToDisk();

    this.logAudit({
      brand_id: target.brand_id,
      user_id: actor?.id || params.actorId,
      user_email: actor?.email || 'system',
      action: 'ROLE_UPDATED',
      details: {
        target_user: target.email,
        username: target.username,
        previous_role: previousRole,
        new_role: params.newRole,
        updated_by: actor?.email || 'Super Admin',
      },
    });

    return target;
  }

  public requestRoleChange(params: {
    userId?: string;
    userEmail?: string;
    userName?: string;
    requestedRole: 'ADMIN' | 'REVIEWER' | 'CREATOR';
    note?: string;
  }): DBUserRecord {
    this.loadFromDisk();
    let user =
      (params.userId ? this.findUserByIdOrIdentifier(params.userId) : undefined) ||
      (params.userEmail ? this.findUserByEmail(params.userEmail) : undefined);

    if (!user && params.userEmail) {
      const cleanEmail = params.userEmail.trim().toLowerCase();
      const defaultBrandId = 'b0000001-0000-4000-8000-000000000001';
      user = {
        id: params.userId || `usr_${Date.now()}`,
        username: cleanEmail.split('@')[0],
        email: cleanEmail,
        hashed_password: hashPassword('session-user'),
        role: 'CREATOR',
        brand_id: defaultBrandId,
        brand_name: 'Default Workspace',
        name: params.userName || cleanEmail.split('@')[0],
        department: 'Marketing',
        is_approved: true,
        lobby_access: true,
        created_at: new Date().toISOString(),
      };
    }

    if (!user) {
      const err: any = new Error('User account not found.');
      err.status = 404;
      throw err;
    }

    user.requested_role = params.requestedRole;
    user.role_request_status = 'pending';
    user.role_request_note = (params.note || '').trim() || null;
    user.role_request_at = new Date().toISOString();
    this.users.set(user.id, user);
    this.saveToDisk();

    this.logAudit({
      brand_id: user.brand_id,
      user_id: user.id,
      user_email: user.email,
      action: 'ROLE_CHANGE_REQUESTED',
      details: {
        user: user.email,
        current_role: user.role,
        requested_role: params.requestedRole,
        note: user.role_request_note || 'Role change requested',
      },
    });

    return user;
  }

  public resolveRoleChangeRequest(params: {
    actorId: string;
    actorRole?: string;
    targetIdentifier: string;
    approve: boolean;
  }): DBUserRecord {
    this.loadFromDisk();
    const target = this.findUserByIdOrIdentifier(params.targetIdentifier);
    if (!target) {
      const err: any = new Error(`Target user "${params.targetIdentifier}" not found.`);
      err.status = 404;
      throw err;
    }

    const requested = target.requested_role || target.role;
    if (params.approve && target.requested_role) {
      return this.updateUserRole({
        actorId: params.actorId,
        actorRole: params.actorRole || 'SUPER_ADMIN',
        targetIdentifier: target.id,
        newRole: target.requested_role,
      });
    }

    target.requested_role = null;
    target.role_request_status = 'rejected';
    this.users.set(target.id, target);
    this.saveToDisk();

    this.logAudit({
      brand_id: target.brand_id,
      user_id: params.actorId,
      user_email: 'admin@gmail.com',
      action: 'ROLE_UPDATED',
      details: {
        target_user: target.email,
        requested_role: requested,
        decision: 'DECLINED',
      },
    });

    return target;
  }

  public updateUserLobbyAccess(params: {
    actorId: string;
    actorRole?: string;
    targetIdentifier: string;
    lobbyAccess: boolean;
  }): DBUserRecord {
    const actor = this.findUserByIdOrIdentifier(params.actorId);
    const effectiveActorRole = (actor?.role || params.actorRole || 'ADMIN').toUpperCase();

    if (
      effectiveActorRole !== 'SUPER_ADMIN' &&
      effectiveActorRole !== 'ADMIN' &&
      effectiveActorRole !== 'REVIEWER' &&
      effectiveActorRole !== 'MANAGER'
    ) {
      const err: any = new Error(
        'Forbidden: Only an Admin or Manager has the right to grant or revoke employee/creator Lobby rights.'
      );
      err.status = 403;
      throw err;
    }

    const target = this.findUserByIdOrIdentifier(params.targetIdentifier);
    if (!target) {
      const err: any = new Error(`Target user "${params.targetIdentifier}" not found.`);
      err.status = 404;
      throw err;
    }

    target.lobby_access = params.lobbyAccess;
    this.users.set(target.id, target);

    this.logAudit({
      brand_id: target.brand_id,
      user_id: actor?.id || params.actorId,
      user_email: actor?.email || 'system',
      action: 'LOBBY_ACCESS_UPDATED',
      details: {
        target_user: target.email,
        username: target.username,
        lobby_rights: params.lobbyAccess ? 'GRANTED' : 'REVOKED',
        updated_by: actor?.email || 'system',
      },
    });

    return target;
  }

  public resetUserPassword(identifier: string, newPassword: string): DBUserRecord {
    const user = this.findUserByUsernameOrEmail(identifier);
    if (!user) {
      const err: any = new Error(`No account found with username or email "${identifier}".`);
      err.status = 404;
      throw err;
    }
    if (!newPassword || newPassword.length < 4) {
      const err: any = new Error('New password must be at least 4 characters.');
      err.status = 400;
      throw err;
    }

    user.hashed_password = hashPassword(newPassword);
    user.password_updated_at = new Date().toISOString();
    this.users.set(user.id, user);

    this.logAudit({
      brand_id: user.brand_id,
      user_id: user.id,
      user_email: user.email,
      action: 'PASSWORD_RESET',
      details: {
        username: user.username,
        email: user.email,
        status: 'Password updated in database',
      },
    });

    return user;
  }

  public updateUserProfile(params: {
    userIdOrEmail: string;
    name?: string;
    department?: string;
    brand_name?: string;
  }): DBUserRecord {
    this.loadFromDisk();
    const user = this.findUserByIdOrIdentifier(params.userIdOrEmail);
    if (!user) {
      const err: any = new Error('User not found.');
      err.status = 404;
      throw err;
    }

    if (params.name && params.name.trim()) {
      user.name = params.name.trim();
    }
    if (params.department && params.department.trim()) {
      user.department = params.department.trim();
    }
    if (params.brand_name && params.brand_name.trim()) {
      user.brand_name = params.brand_name.trim();
    }

    this.users.set(user.id, user);
    this.saveToDisk();

    this.logAudit({
      brand_id: user.brand_id,
      user_id: user.id,
      user_email: user.email,
      action: 'PROFILE_UPDATED',
      details: {
        updated_name: user.name,
        department: user.department,
        brand_name: user.brand_name,
      },
    });

    return user;
  }

  public deleteUserAccount(userIdOrEmail: string): boolean {
    this.loadFromDisk();
    const user = this.findUserByIdOrIdentifier(userIdOrEmail);
    const cleanId = (userIdOrEmail || '').trim().toLowerCase();

    if (!user) {
      if (cleanId) {
        this.deletedUserEmails.add(cleanId);
        this.saveToDisk();
      }
      return false;
    }

    if (user.role === 'SUPER_ADMIN' || user.email.toLowerCase() === 'admin@gmail.com') {
      const err: any = new Error('Cannot delete primary Super Admin account.');
      err.status = 400;
      throw err;
    }

    // Add to permanent deletion tombstone set
    this.deletedUserEmails.add(user.id);
    this.deletedUserEmails.add(user.email.toLowerCase());
    if (user.username) {
      this.deletedUserEmails.add(user.username.toLowerCase());
    }
    if (cleanId) {
      this.deletedUserEmails.add(cleanId);
    }

    this.users.delete(user.id);
    this.saveToDisk();

    this.logAudit({
      brand_id: user.brand_id,
      user_id: user.id,
      user_email: user.email,
      action: 'USER_ACCOUNT_DELETED',
      details: {
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });

    return true;
  }

  public generatePin(params: {
    adminUser: DBUserRecord;
    brandId?: string;
    prefix?: string;
  }): BrandPinRecord {
    if (params.adminUser.role !== 'ADMIN' && params.adminUser.role !== 'SUPER_ADMIN') {
      const err: any = new Error(
        `Access denied: Operation requires ADMIN role. Current role: ${params.adminUser.role}`
      );
      err.status = 403;
      throw err;
    }

    const targetWorkspace =
      (params.brandId && this.workspaces.get(params.brandId)) ||
      this.workspaces.get(params.adminUser.brand_id) ||
      Array.from(this.workspaces.values())[0];

    const defaultPrefix = targetWorkspace.name.slice(0, 3).toUpperCase();
    const cleanPrefix = (params.prefix || defaultPrefix || 'PIN').trim().toUpperCase();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const pinCode = `${cleanPrefix}-${randomNum}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const newPin: BrandPinRecord = {
      id: crypto.randomUUID(),
      brand_id: targetWorkspace.id,
      brand_name: targetWorkspace.name,
      pin_code: pinCode,
      created_by_id: params.adminUser.id,
      created_by_email: params.adminUser.email,
      created_at: now,
      expires_at: expiresAt,
      is_used: false,
      used_by_email: null,
      used_at: null,
    };

    this.pins.set(pinCode, newPin);

    this.logAudit({
      brand_id: targetWorkspace.id,
      user_id: params.adminUser.id,
      user_email: params.adminUser.email,
      action: 'PIN_GENERATED',
      details: {
        pin_code: newPin.pin_code,
        brand: targetWorkspace.name,
        generated_by: params.adminUser.email,
      },
    });

    return newPin;
  }

  public verifyAndBurnPin(params: {
    pin_code: string;
    brand_id?: string;
    user_email: string;
  }): BrandPinRecord {
    const cleanPin = params.pin_code.trim().toUpperCase();
    const pin = this.pins.get(cleanPin);

    if (!pin) {
      const err: any = new Error(`Invalid BrandPIN "${cleanPin}". PIN does not exist.`);
      err.status = 404;
      throw err;
    }

    if (pin.is_used) {
      const err: any = new Error(
        `BrandPIN "${cleanPin}" has already been used by ${pin.used_by_email} and is permanently burned.`
      );
      err.status = 403;
      throw err;
    }

    if (new Date(pin.expires_at).getTime() < Date.now()) {
      const err: any = new Error('BrandPIN has expired. Request a fresh PIN.');
      err.status = 403;
      throw err;
    }

    pin.is_used = true;
    pin.used_by_email = params.user_email.trim().toLowerCase();
    pin.used_at = new Date().toISOString();

    this.logAudit({
      brand_id: pin.brand_id,
      user_id: null,
      user_email: pin.used_by_email,
      action: 'PIN_BURNED',
      details: {
        pin_code: pin.pin_code,
        used_by_email: pin.used_by_email,
        brand: pin.brand_name,
      },
    });

    return pin;
  }

  public logAudit(entry: {
    brand_id: string;
    user_id: string | null;
    user_email?: string;
    ip_address?: string;
    action: AuditLogRecord['action'];
    details: Record<string, any>;
  }) {
    const detailsText = formatDetailsText(entry.action, entry.details);
    const actorEmail =
      entry.user_email ||
      entry.details?.email ||
      entry.details?.used_by_email ||
      entry.details?.generated_by ||
      entry.details?.created_by ||
      'system';

    const record: AuditLogRecord = {
      id: crypto.randomUUID(),
      brand_id: entry.brand_id,
      user_id: entry.user_id,
      user_email: actorEmail,
      ip_address: entry.ip_address || '127.0.0.1',
      action: entry.action,
      details: entry.details,
      details_text: detailsText,
      timestamp: new Date().toISOString(),
    };
    this.auditLogs.unshift(record);
    this.saveToDisk();
    return record;
  }

  private getStorageFilePath(): string {
    try {
      const localDir = path.join(process.cwd(), '.data');
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      return path.join(localDir, 'security-db.json');
    } catch {
      return '/tmp/brandlens-security-db.json';
    }
  }

  private lastLoadedMtime = 0;

  public saveToDisk(): void {
    try {
      const filePath = this.getStorageFilePath();
      const payload = {
        workspaces: Array.from(this.workspaces.entries()),
        users: Array.from(this.users.entries()),
        pins: Array.from(this.pins.entries()),
        guidelines: Array.from(this.guidelines.entries()),
        submissions: Array.from(this.submissions.entries()),
        auditLogs: this.auditLogs.slice(0, 250),
        deletedUserEmails: Array.from(this.deletedUserEmails),
      };
      const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tempPath, filePath);
      try {
        const stat = fs.statSync(filePath);
        this.lastLoadedMtime = stat.mtimeMs;
      } catch {}
    } catch {
      // Safe fallback in read-only environments
    }
  }

  public loadFromDisk(force = false): void {
    try {
      const filePath = this.getStorageFilePath();
      if (!fs.existsSync(filePath)) {
        this.seedInitialAccounts();
        this.saveToDisk();
        return;
      }

      const stat = fs.statSync(filePath);
      if (!force && this.users.size > 0 && this.lastLoadedMtime >= stat.mtimeMs) {
        return;
      }
      this.lastLoadedMtime = stat.mtimeMs;

      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw || !raw.trim()) {
        this.seedInitialAccounts();
        this.saveToDisk();
        return;
      }

      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed.deletedUserEmails)) {
        this.deletedUserEmails = new Set(
          parsed.deletedUserEmails.map((e: string) => String(e).toLowerCase().trim())
        );
      }

      if (Array.isArray(parsed.workspaces)) {
        for (const item of parsed.workspaces) {
          let id: string | undefined;
          let ws: BrandWorkspaceRecord | undefined;
          if (Array.isArray(item) && item.length === 2) {
            [id, ws] = item;
          } else if (item && typeof item === 'object' && item.id) {
            id = item.id;
            ws = item;
          }
          if (id && ws && ws.name) {
            this.workspaces.set(id, ws);
          }
        }
      }

      if (Array.isArray(parsed.users)) {
        for (const item of parsed.users) {
          let id: string | undefined;
          let u: DBUserRecord | undefined;
          if (Array.isArray(item) && item.length === 2) {
            [id, u] = item;
          } else if (item && typeof item === 'object' && item.id) {
            id = item.id;
            u = item;
          }
          if (id && u && u.email && !LEGACY_DEMO_USER_IDS.has(id)) {
            const emailLower = u.email.toLowerCase().trim();
            const idLower = id.toLowerCase().trim();
            const usernameLower = (u.username || '').toLowerCase().trim();
            if (
              this.deletedUserEmails.has(emailLower) ||
              this.deletedUserEmails.has(idLower) ||
              (usernameLower && this.deletedUserEmails.has(usernameLower))
            ) {
              continue; // Do NOT load permanently deleted user
            }
            if (u.email.toLowerCase() === 'admin@gmail.com') {
              u.role = 'SUPER_ADMIN';
            }
            this.users.set(id, u);
          }
        }
      }

      if (Array.isArray(parsed.pins)) {
        for (const item of parsed.pins) {
          let code: string | undefined;
          let p: BrandPinRecord | undefined;
          if (Array.isArray(item) && item.length === 2) {
            [code, p] = item;
          } else if (item && typeof item === 'object' && item.pin_code) {
            code = item.pin_code;
            p = item;
          }
          if (code && p && !LEGACY_DEMO_PINS.has(code)) {
            this.pins.set(code, p);
          }
        }
      }

      if (Array.isArray(parsed.guidelines)) {
        for (const item of parsed.guidelines) {
          let id: string | undefined;
          let g: BrandGuidelineRecord | undefined;
          if (Array.isArray(item) && item.length === 2) {
            [id, g] = item;
          } else if (item && typeof item === 'object' && item.id) {
            id = item.id;
            g = item;
          }
          if (id && g && g.title) {
            this.guidelines.set(id, g);
          }
        }
      }

      if (Array.isArray(parsed.submissions)) {
        for (const item of parsed.submissions) {
          let id: string | undefined;
          let sub: SubmissionRecord | undefined;
          if (Array.isArray(item) && item.length === 2) {
            [id, sub] = item;
          } else if (item && typeof item === 'object' && item.id) {
            id = item.id;
            sub = item;
          }
          if (id && sub && sub.campaign_name) {
            this.submissions.set(id, sub);
          }
        }
      }

      if (Array.isArray(parsed.auditLogs) && parsed.auditLogs.length > 0) {
        this.auditLogs = parsed.auditLogs;
      }

      this.seedInitialAccounts();
    } catch (err) {
      console.warn('Failed to load security DB from disk:', err);
      this.seedInitialAccounts();
    }
  }
}

const globalForSecurityDB = globalThis as unknown as {
  securityDB?: MultiTenantSecurityDB;
};

if (!globalForSecurityDB.securityDB || typeof globalForSecurityDB.securityDB.ensureSuperAdminAccount !== 'function') {
  const instance = new MultiTenantSecurityDB();
  instance.loadFromDisk();
  instance.purgeLegacyDemoRecords();
  instance.saveToDisk();
  globalForSecurityDB.securityDB = instance;
} else {
  globalForSecurityDB.securityDB.loadFromDisk();
  globalForSecurityDB.securityDB.purgeLegacyDemoRecords();
  globalForSecurityDB.securityDB.saveToDisk();
}

export const securityDB = globalForSecurityDB.securityDB;
