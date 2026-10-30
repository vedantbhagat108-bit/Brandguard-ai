import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { store } from './store.ts';
import { readFirestoreSlice, writeFirestoreSlice } from './firestoreStateSync.ts';

export type DBRole = 'SUPER_ADMIN' | 'ADMIN' | 'REVIEWER' | 'CREATOR';

export const VALID_DB_ROLES: ReadonlySet<string> = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'REVIEWER',
  'CREATOR',
]);

export interface BrandWorkspaceRecord {
  id: string;
  name: string;
  brand_name: string;
  created_at: string;
  updated_at?: string;
  version?: number;
  is_demo?: boolean;
}

export interface BrandPinRecord {
  id: string;
  brand_id: string;
  brand_name: string;
  pin_code: string;
  created_by_id?: string;
  created_by_email?: string;
  created_at: string;
  updated_at?: string;
  version?: number;
  expires_at: string;
  is_used: boolean;
  used_by_email: string | null;
  used_at: string | null;
}

export interface DBUserRecord {
  id: string;
  firebase_uid?: string;
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
  updated_at?: string;
  version?: number;
  is_demo?: boolean;
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

const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

function isIncomingRecordNewer(
  incoming: { version?: number; updated_at?: string },
  current: { version?: number; updated_at?: string }
): boolean {
  const inVer = typeof incoming.version === 'number' ? incoming.version : 1;
  const curVer = typeof current.version === 'number' ? current.version : 1;
  if (inVer !== curVer) {
    return inVer > curVer;
  }
  const inTs = incoming.updated_at || '';
  const curTs = current.updated_at || '';
  if (inTs && curTs && inTs !== curTs) {
    return inTs > curTs;
  }
  return Boolean(inTs && !curTs);
}

export class MultiTenantSecurityDB {
  public workspaces = new Map<string, BrandWorkspaceRecord>();
  public pins = new Map<string, BrandPinRecord>();
  public users = new Map<string, DBUserRecord>();
  public guidelines = new Map<string, BrandGuidelineRecord>();
  public submissions = new Map<string, SubmissionRecord>();
  public auditLogs: AuditLogRecord[] = [];
  public deletedUserEmails = new Set<string>();
  public dbVersion = 1;
  private lastCloudPullMs = 0;

  constructor() {
    this.seedWorkspacesAndGuidelines();
  }

  public seedWorkspacesAndGuidelines() {
    const brandGlobalId = 'b0000000-0000-4000-8000-000000000000';
    if (!this.workspaces.has(brandGlobalId)) {
      this.workspaces.set(brandGlobalId, {
        id: brandGlobalId,
        name: 'Global Governance',
        brand_name: 'Global Governance',
        created_at: SEED_TIMESTAMP,
        updated_at: SEED_TIMESTAMP,
        version: 1,
      });
    }
    const brandDefaultId = 'b0000001-0000-4000-8000-000000000001';
    if (!this.workspaces.has(brandDefaultId)) {
      this.workspaces.set(brandDefaultId, {
        id: brandDefaultId,
        name: 'Default Workspace',
        brand_name: 'Default Workspace',
        created_at: SEED_TIMESTAMP,
        updated_at: SEED_TIMESTAMP,
        version: 1,
        is_demo: true,
      });
    }
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
      if (typeof u.version !== 'number') {
        u.version = 1;
      }
      if (!u.updated_at) {
        u.updated_at = u.created_at || SEED_TIMESTAMP;
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

    if (existing) {
      // Idempotent: preserve all existing fields, only guarantee SUPER_ADMIN role
      if (existing.role !== 'SUPER_ADMIN') {
        existing.role = 'SUPER_ADMIN';
        existing.is_approved = true;
        existing.lobby_access = true;
      }
      if (typeof existing.version !== 'number') existing.version = 1;
      if (!existing.updated_at) existing.updated_at = existing.created_at || SEED_TIMESTAMP;
      this.users.set(existing.id, existing);
      return;
    }

    const superAdminRecord: DBUserRecord = {
      id: superAdminId,
      username: 'admin@gmail.com',
      email: superAdminEmail,
      hashed_password: hashPassword('Ashu@12'),
      role: 'SUPER_ADMIN',
      brand_id: 'b0000000-0000-4000-8000-000000000000',
      brand_name: 'Global Governance',
      name: 'Super Admin',
      department: 'Platform Governance',
      is_approved: true,
      lobby_access: true,
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP,
      version: 1,
    };
    this.users.set(superAdminRecord.id, superAdminRecord);
  }

  public seedInitialAccounts() {
    this.ensureSuperAdminAccount();

    const defaultBrandId = 'b0000001-0000-4000-8000-000000000001';
    const defaultBrandName = 'Default Workspace';

    // 1. Demo account (demo@t1.in) — create ONLY if missing
    const demoDeleted =
      this.deletedUserEmails.has('demo@t1.in') ||
      this.deletedUserEmails.has('demo') ||
      this.deletedUserEmails.has('u_demo_t1');
    const existingDemo =
      this.users.get('u_demo_t1') ||
      this.findUserByEmail('demo@t1.in') ||
      this.findUserByUsername('demo');
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
        created_at: SEED_TIMESTAMP,
        updated_at: SEED_TIMESTAMP,
        version: 1,
        is_demo: true,
      };
      this.users.set(demoUser.id, demoUser);
    }

    // 2. Demo creator account (demo@gmail.com) — create ONLY if missing
    const creatorDeleted =
      this.deletedUserEmails.has('demo@gmail.com') ||
      this.deletedUserEmails.has('democreator') ||
      this.deletedUserEmails.has('u_demo_creator');
    const existingCreator =
      this.users.get('u_demo_creator') ||
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
        created_at: SEED_TIMESTAMP,
        updated_at: SEED_TIMESTAMP,
        version: 1,
        is_demo: true,
      };
      this.users.set(creatorUser.id, creatorUser);
    }

    // 3. Demo workspace admin account (demoadmin@gmail.com, role: ADMIN, NOT SUPER_ADMIN) — create ONLY if missing
    const adminDeleted =
      this.deletedUserEmails.has('demoadmin@gmail.com') ||
      this.deletedUserEmails.has('demoadmin') ||
      this.deletedUserEmails.has('u_demo_admin');
    const existingAdmin =
      this.users.get('u_demo_admin') ||
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
        created_at: SEED_TIMESTAMP,
        updated_at: SEED_TIMESTAMP,
        version: 1,
        is_demo: true,
      };
      this.users.set(adminUser.id, adminUser);
    }
  }

  /**
   * Resets ONLY isolated demo accounts (demo@gmail.com, demoadmin@gmail.com, demo@t1.in)
   * without touching any real users, real workspaces, or real role assignments.
   */
  public resetDemoDataOnly(actorId?: string): DBUserRecord[] {
    this.loadFromDisk(true);
    const now = new Date().toISOString();
    const defaultBrandId = 'b0000001-0000-4000-8000-000000000001';
    const defaultBrandName = 'Default Workspace';

    this.deletedUserEmails.delete('demo@gmail.com');
    this.deletedUserEmails.delete('democreator');
    this.deletedUserEmails.delete('u_demo_creator');
    this.deletedUserEmails.delete('demoadmin@gmail.com');
    this.deletedUserEmails.delete('demoadmin');
    this.deletedUserEmails.delete('u_demo_admin');
    this.deletedUserEmails.delete('demo@t1.in');
    this.deletedUserEmails.delete('demo');
    this.deletedUserEmails.delete('u_demo_t1');

    const demoSpecs: Array<{
      id: string;
      username: string;
      email: string;
      pass: string;
      role: DBRole;
      name: string;
      dept: string;
    }> = [
      {
        id: 'u_demo_creator',
        username: 'democreator',
        email: 'demo@gmail.com',
        pass: 'password123',
        role: 'CREATOR',
        name: 'Demo Creator',
        dept: 'Marketing',
      },
      {
        id: 'u_demo_admin',
        username: 'demoadmin',
        email: 'demoadmin@gmail.com',
        pass: 'password123',
        role: 'ADMIN',
        name: 'Demo Admin',
        dept: 'Compliance',
      },
      {
        id: 'u_demo_t1',
        username: 'demo',
        email: 'demo@t1.in',
        pass: 'demo123',
        role: 'ADMIN',
        name: 'demo',
        dept: 'Marketing',
      },
    ];

    const resetList: DBUserRecord[] = [];
    for (const spec of demoSpecs) {
      const existing =
        this.users.get(spec.id) ||
        this.findUserByEmail(spec.email) ||
        this.findUserByUsername(spec.username);
      const nextVer = (existing?.version || 1) + 1;
      const record: DBUserRecord = {
        id: existing?.id || spec.id,
        firebase_uid: existing?.firebase_uid,
        username: spec.username,
        email: spec.email,
        hashed_password: hashPassword(spec.pass),
        role: spec.role,
        brand_id: defaultBrandId,
        brand_name: defaultBrandName,
        name: spec.name,
        department: spec.dept,
        is_approved: true,
        lobby_access: true,
        created_at: existing?.created_at || SEED_TIMESTAMP,
        updated_at: now,
        version: nextVer,
        is_demo: true,
        requested_role: null,
        role_request_status: null,
        role_request_note: null,
        role_request_at: null,
      };
      this.users.set(record.id, record);
      resetList.push(record);
    }

    this.logAudit({
      brand_id: defaultBrandId,
      user_id: actorId || 'u0000000-super-admin',
      user_email: 'admin@gmail.com',
      action: 'STATUS_UPDATED',
      details: {
        summary: 'Reset demo accounts only (real accounts and workspaces preserved)',
        reset_accounts: resetList.map((u) => `${u.email} (${u.role})`).join(', '),
      },
    });

    return resetList;
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
        updated_at: now,
        version: 1,
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
    for (const u of this.users.values()) {
      if (u.firebase_uid && u.firebase_uid === clean) {
        return u;
      }
    }
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
    this.loadFromDisk(true);

    // Validate role strictly (no silent "safe role" clamping)
    if (!params.newRole || !VALID_DB_ROLES.has(params.newRole)) {
      const err: any = new Error(
        `Invalid role "${params.newRole}". Allowed values: SUPER_ADMIN, ADMIN, REVIEWER, CREATOR.`
      );
      err.status = 400;
      throw err;
    }

    // Enforce server-side authorization from authoritative DB record (never trust localStorage headers)
    const actor = this.findUserByIdOrIdentifier(params.actorId);
    const actorEmail = (actor?.email || '').toLowerCase();
    const isVerifiedSuperAdmin = actor
      ? actor.role === 'SUPER_ADMIN' || actorEmail === 'admin@gmail.com'
      : params.actorId === 'u0000000-super-admin' ||
        params.actorId.toLowerCase() === 'admin@gmail.com';

    if (!isVerifiedSuperAdmin) {
      const err: any = new Error(
        'Forbidden: Only Super Admin can promote or change user roles.'
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

    if (
      target.email.toLowerCase() === 'admin@gmail.com' &&
      params.newRole !== 'SUPER_ADMIN'
    ) {
      const err: any = new Error(
        'Primary Super Admin account (admin@gmail.com) cannot be demoted.'
      );
      err.status = 400;
      throw err;
    }

    const previousRole = target.role;
    const now = new Date().toISOString();
    const nextVersion = (target.version || 1) + 1;

    target.role = params.newRole;
    target.is_approved = true;
    target.lobby_access = true;
    target.requested_role = null;
    target.role_request_status = 'approved';
    target.updated_at = now;
    target.version = nextVersion;
    this.users.set(target.id, target);
    this.saveToDisk();

    this.logAudit({
      brand_id: target.brand_id,
      user_id: actor?.id || params.actorId,
      user_email: actor?.email || 'admin@gmail.com',
      action: 'ROLE_UPDATED',
      details: {
        actor_id: actor?.id || params.actorId,
        actor_email: actor?.email || 'admin@gmail.com',
        target_user_id: target.id,
        target_user: target.email,
        username: target.username,
        previous_role: previousRole,
        new_role: target.role,
        version: nextVersion,
        updated_by: actor?.email || 'admin@gmail.com',
        timestamp: now,
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
    this.loadFromDisk(true);
    let user =
      (params.userId ? this.findUserByIdOrIdentifier(params.userId) : undefined) ||
      (params.userEmail ? this.findUserByEmail(params.userEmail) : undefined);

    const now = new Date().toISOString();
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
        created_at: now,
        updated_at: now,
        version: 1,
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
    user.role_request_at = now;
    user.updated_at = now;
    user.version = (user.version || 1) + 1;
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
        version: user.version,
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
    this.loadFromDisk(true);

    const actor = this.findUserByIdOrIdentifier(params.actorId);
    const actorEmail = (actor?.email || '').toLowerCase();
    const isVerifiedSuperAdmin = actor
      ? actor.role === 'SUPER_ADMIN' || actorEmail === 'admin@gmail.com'
      : params.actorId === 'u0000000-super-admin' ||
        params.actorId.toLowerCase() === 'admin@gmail.com';

    if (!isVerifiedSuperAdmin) {
      const err: any = new Error(
        'Forbidden: Only Super Admin can approve or reject role change requests.'
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

    const requested = target.requested_role || target.role;
    if (params.approve && target.requested_role) {
      return this.updateUserRole({
        actorId: params.actorId,
        actorRole: 'SUPER_ADMIN',
        targetIdentifier: target.id,
        newRole: target.requested_role,
      });
    }

    const now = new Date().toISOString();
    target.requested_role = null;
    target.role_request_status = 'rejected';
    target.updated_at = now;
    target.version = (target.version || 1) + 1;
    this.users.set(target.id, target);
    this.saveToDisk();

    this.logAudit({
      brand_id: target.brand_id,
      user_id: actor?.id || params.actorId,
      user_email: actor?.email || 'admin@gmail.com',
      action: 'ROLE_UPDATED',
      details: {
        actor_id: actor?.id || params.actorId,
        actor_email: actor?.email || 'admin@gmail.com',
        target_user_id: target.id,
        target_user: target.email,
        previous_role: target.role,
        requested_role: requested,
        decision: 'DECLINED',
        version: target.version,
        timestamp: now,
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
    this.loadFromDisk(true);
    const actor = this.findUserByIdOrIdentifier(params.actorId);
    const effectiveActorRole = actor
      ? actor.role.toUpperCase()
      : (params.actorRole || '').toUpperCase();

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

    const previousLobbyAccess = target.lobby_access;
    const now = new Date().toISOString();
    target.lobby_access = params.lobbyAccess;
    target.updated_at = now;
    target.version = (target.version || 1) + 1;
    this.users.set(target.id, target);
    this.saveToDisk();

    this.logAudit({
      brand_id: target.brand_id,
      user_id: actor?.id || params.actorId,
      user_email: actor?.email || 'system',
      action: 'LOBBY_ACCESS_UPDATED',
      details: {
        actor_id: actor?.id || params.actorId,
        actor_email: actor?.email || 'system',
        target_user_id: target.id,
        target_user: target.email,
        username: target.username,
        previous_lobby_rights: previousLobbyAccess ? 'GRANTED' : 'REVOKED',
        lobby_rights: params.lobbyAccess ? 'GRANTED' : 'REVOKED',
        version: target.version,
        updated_by: actor?.email || 'system',
        timestamp: now,
      },
    });

    return target;
  }

  public resetUserPassword(identifier: string, newPassword: string): DBUserRecord {
    this.loadFromDisk(true);
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

    const now = new Date().toISOString();
    user.hashed_password = hashPassword(newPassword);
    user.password_updated_at = now;
    user.updated_at = now;
    user.version = (user.version || 1) + 1;
    this.users.set(user.id, user);
    this.saveToDisk();

    this.logAudit({
      brand_id: user.brand_id,
      user_id: user.id,
      user_email: user.email,
      action: 'PASSWORD_RESET',
      details: {
        username: user.username,
        email: user.email,
        version: user.version,
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
    this.loadFromDisk(true);
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

    user.updated_at = new Date().toISOString();
    user.version = (user.version || 1) + 1;
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
        version: user.version,
      },
    });

    return user;
  }

  public deleteUserAccount(userIdOrEmail: string): boolean {
    this.loadFromDisk(true);
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
    this.deletedUserEmails.add(user.id.toLowerCase());
    this.deletedUserEmails.add(user.id);
    this.deletedUserEmails.add(user.email.toLowerCase());
    if (user.firebase_uid) {
      this.deletedUserEmails.add(user.firebase_uid);
      this.deletedUserEmails.add(user.firebase_uid.toLowerCase());
    }
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
    this.loadFromDisk(true);
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
      updated_at: now,
      version: 1,
      expires_at: expiresAt,
      is_used: false,
      used_by_email: null,
      used_at: null,
    };

    this.pins.set(pinCode, newPin);
    this.saveToDisk();

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
    this.loadFromDisk(true);
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

    const now = new Date().toISOString();
    pin.is_used = true;
    pin.used_by_email = params.user_email.trim().toLowerCase();
    pin.used_at = now;
    pin.updated_at = now;
    pin.version = (pin.version || 1) + 1;
    this.pins.set(cleanPin, pin);
    this.saveToDisk();

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
      entry.details?.actor_email ||
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
    if (this.auditLogs.length > 250) {
      this.auditLogs = this.auditLogs.slice(0, 250);
    }
    this.saveToDisk();
    return record;
  }

  private getStorageFilePath(): string {
    const tmpPath = '/tmp/brandlens-security-db.json';
    try {
      const localDir = path.join(process.cwd(), '.data');
      const localFile = path.join(localDir, 'security-db.json');
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      fs.accessSync(localDir, fs.constants.W_OK);
      return localFile;
    } catch {
      try {
        const bundledFile = path.join(process.cwd(), '.data', 'security-db.json');
        if (!fs.existsSync(tmpPath) && fs.existsSync(bundledFile)) {
          fs.copyFileSync(bundledFile, tmpPath);
        }
      } catch {}
      return tmpPath;
    }
  }

  private serializeState() {
    return {
      dbVersion: this.dbVersion,
      workspaces: Array.from(this.workspaces.entries()),
      users: Array.from(this.users.entries()),
      pins: Array.from(this.pins.entries()),
      guidelines: Array.from(this.guidelines.entries()),
      submissions: Array.from(this.submissions.entries()),
      auditLogs: this.auditLogs.slice(0, 150),
      deletedUserEmails: Array.from(this.deletedUserEmails),
    };
  }

  private applyParsedState(parsed: any): boolean {
    if (!parsed || typeof parsed !== 'object') return false;
    let changed = false;

    if (typeof parsed.dbVersion === 'number' && parsed.dbVersion > this.dbVersion) {
      this.dbVersion = parsed.dbVersion;
      changed = true;
    }

    if (Array.isArray(parsed.deletedUserEmails)) {
      for (const rawEmail of parsed.deletedUserEmails) {
        const clean = String(rawEmail).toLowerCase().trim();
        if (clean && !this.deletedUserEmails.has(clean)) {
          this.deletedUserEmails.add(clean);
          changed = true;
        }
      }
      // Purge any in-memory users that match tombstones
      for (const [id, u] of Array.from(this.users.entries())) {
        if (
          this.deletedUserEmails.has(id.toLowerCase()) ||
          this.deletedUserEmails.has(u.email.toLowerCase()) ||
          (u.username && this.deletedUserEmails.has(u.username.toLowerCase())) ||
          (u.firebase_uid && this.deletedUserEmails.has(u.firebase_uid.toLowerCase()))
        ) {
          this.users.delete(id);
          changed = true;
        }
      }
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
          const cur = this.workspaces.get(id);
          if (!cur || isIncomingRecordNewer(ws, cur)) {
            this.workspaces.set(id, ws);
            changed = true;
          }
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
            continue;
          }
          if (emailLower === 'admin@gmail.com') {
            u.role = 'SUPER_ADMIN';
          }
          if (typeof u.version !== 'number') {
            u.version = 1;
          }
          if (!u.updated_at) {
            u.updated_at = u.created_at || SEED_TIMESTAMP;
          }

          // Match existing user by id or email so we never create split duplicates
          const existingByEmail = this.findUserByEmail(emailLower);
          const currentInMem = this.users.get(id) || existingByEmail;

          if (!currentInMem) {
            this.users.set(id, u);
            changed = true;
          } else if (isIncomingRecordNewer(u, currentInMem)) {
            if (currentInMem.id !== id) {
              this.users.delete(currentInMem.id);
            }
            this.users.set(id, {
              ...currentInMem,
              ...u,
              firebase_uid: u.firebase_uid || currentInMem.firebase_uid,
            });
            changed = true;
          }
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
          const cur = this.pins.get(code);
          if (!cur || isIncomingRecordNewer(p, cur) || (p.is_used && !cur.is_used)) {
            this.pins.set(code, p);
            changed = true;
          }
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
        if (id && g && g.title && !this.guidelines.has(id)) {
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
        if (id && sub && sub.campaign_name && !this.submissions.has(id)) {
          this.submissions.set(id, sub);
        }
      }
    }

    if (Array.isArray(parsed.auditLogs) && parsed.auditLogs.length > 0) {
      const seenIds = new Set(this.auditLogs.map((a) => a.id));
      let addedLogs = false;
      for (const log of parsed.auditLogs) {
        if (log && log.id && !seenIds.has(log.id)) {
          this.auditLogs.push(log);
          seenIds.add(log.id);
          addedLogs = true;
        }
      }
      if (addedLogs) {
        this.auditLogs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        this.auditLogs = this.auditLogs.slice(0, 250);
      }
    }

    return changed;
  }

  public saveToDisk(): void {
    try {
      this.dbVersion = Math.max(1, this.dbVersion + 1);
      const filePath = this.getStorageFilePath();
      const payload = this.serializeState();
      const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tempPath, filePath);
    } catch {
      // Safe fallback in read-only environments
    }
  }

  public loadFromDisk(_force = false): void {
    try {
      const filePath = this.getStorageFilePath();
      if (!fs.existsSync(filePath)) {
        this.seedInitialAccounts();
        this.saveToDisk();
        return;
      }

      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw || !raw.trim()) {
        this.seedInitialAccounts();
        this.saveToDisk();
        return;
      }

      const parsed = JSON.parse(raw);
      this.applyParsedState(parsed);
      this.seedInitialAccounts();
    } catch (err) {
      console.warn('Failed to load security DB from disk:', err);
      this.seedInitialAccounts();
    }
  }

  /**
   * Pulls and reconciles the authoritative `security_db` snapshot from Firestore
   * so all Vercel serverless instances and worker processes share identical state.
   */
  public async syncFromCloud(force = false): Promise<void> {
    this.loadFromDisk(true);
    const nowMs = Date.now();
    if (!force && nowMs - this.lastCloudPullMs < 750) {
      return;
    }
    this.lastCloudPullMs = nowMs;

    const remote = await readFirestoreSlice<any>('security_db');
    if (!remote || !remote.data) {
      return;
    }

    const changed = this.applyParsedState({
      ...remote.data,
      dbVersion: Math.max(remote.version || 1, remote.data.dbVersion || 1),
    });
    this.seedInitialAccounts();
    if (changed) {
      try {
        const filePath = this.getStorageFilePath();
        const payload = this.serializeState();
        const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
        fs.renameSync(tempPath, filePath);
      } catch {}
    }
  }

  /**
   * Persists the current authoritative `security_db` state to Firestore (`server_sync/security_db`).
   */
  public async saveToCloud(): Promise<boolean> {
    this.dbVersion = Math.max(1, this.dbVersion + 1);
    this.saveToDisk();
    const nowIso = new Date().toISOString();
    const payload = this.serializeState();
    return writeFirestoreSlice('security_db', this.dbVersion, nowIso, payload);
  }
}

const globalForSecurityDB = globalThis as unknown as {
  securityDB?: MultiTenantSecurityDB;
};

if (!globalForSecurityDB.securityDB || typeof globalForSecurityDB.securityDB.syncFromCloud !== 'function') {
  const instance = new MultiTenantSecurityDB();
  instance.loadFromDisk(true);
  instance.purgeLegacyDemoRecords();
  instance.saveToDisk();
  globalForSecurityDB.securityDB = instance;
} else {
  globalForSecurityDB.securityDB.loadFromDisk(true);
  globalForSecurityDB.securityDB.purgeLegacyDemoRecords();
  globalForSecurityDB.securityDB.saveToDisk();
}

export const securityDB = globalForSecurityDB.securityDB;

