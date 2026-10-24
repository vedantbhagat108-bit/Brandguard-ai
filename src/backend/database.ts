import crypto from 'crypto';
import { store } from './store.ts';

export type DBRole = 'ADMIN' | 'REVIEWER' | 'CREATOR';

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
  name: string;
  department: string;
  is_approved: boolean;
  lobby_access: boolean;
  created_at: string;
  password_updated_at?: string;
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
    | 'LOBBY_ACCESS_UPDATED'
    | 'GMAIL_OTP_SENT';
  details: Record<string, any>;
  details_text: string;
  timestamp: string;
}

const JWT_SECRET = process.env.JWT_SECRET_KEY || 'brandlens-ai-secure-secret-key-change-in-production-2026';

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

  constructor() {
    this.seedDemoData();
  }

  public seedDemoData() {
    if (this.workspaces.size > 0) return;

    const now = new Date().toISOString();
    const expiry7d = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    // 1. Brand Workspaces (matching seed_data.py + Aurelia Skin)
    const brandEco: BrandWorkspaceRecord = {
      id: 'b0000001-0000-4000-8000-000000000001',
      name: 'EcoFresh Botanicals',
      brand_name: 'EcoFresh Botanicals',
      created_at: now,
    };
    const brandNova: BrandWorkspaceRecord = {
      id: 'b0000002-0000-4000-8000-000000000002',
      name: 'NovaTech Cloud',
      brand_name: 'NovaTech Cloud',
      created_at: now,
    };
    const brandAurelia: BrandWorkspaceRecord = {
      id: 'b0000003-0000-4000-8000-000000000003',
      name: 'Aurelia Skin',
      brand_name: 'Aurelia Skin',
      created_at: now,
    };

    this.workspaces.set(brandEco.id, brandEco);
    this.workspaces.set(brandNova.id, brandNova);
    this.workspaces.set(brandAurelia.id, brandAurelia);
    this.workspaces.set('ws_ecofresh', brandEco);
    this.workspaces.set('ws_novatech', brandNova);
    this.workspaces.set('ws_aurelia', brandAurelia);

    // 2. Brand PINs (Single-Use Burnable OTPs from seed_data.py)
    const pinsList: BrandPinRecord[] = [
      {
        id: crypto.randomUUID(),
        brand_id: brandEco.id,
        brand_name: brandEco.name,
        pin_code: 'ECO-8821',
        created_by_id: 'u0000000-admin-vedant',
        created_by_email: 'VedantBhagat@admin.in',
        created_at: now,
        expires_at: expiry7d,
        is_used: false,
        used_by_email: null,
        used_at: null,
      },
      {
        id: crypto.randomUUID(),
        brand_id: brandNova.id,
        brand_name: brandNova.name,
        pin_code: 'NOVA-4410',
        created_by_id: 'u0000000-admin-vedant',
        created_by_email: 'VedantBhagat@admin.in',
        created_at: now,
        expires_at: expiry7d,
        is_used: false,
        used_by_email: null,
        used_at: null,
      },
      {
        id: crypto.randomUUID(),
        brand_id: brandAurelia.id,
        brand_name: brandAurelia.name,
        pin_code: 'AUR-9920',
        created_by_id: 'u0000000-admin-vedant',
        created_by_email: 'VedantBhagat@admin.in',
        created_at: now,
        expires_at: expiry7d,
        is_used: false,
        used_by_email: null,
        used_at: null,
      },
      {
        id: crypto.randomUUID(),
        brand_id: brandEco.id,
        brand_name: brandEco.name,
        pin_code: 'ECO-0019',
        created_by_id: 'u0000000-admin-vedant',
        created_by_email: 'VedantBhagat@admin.in',
        created_at: now,
        expires_at: expiry7d,
        is_used: true,
        used_by_email: 'creator@ecofresh.com',
        used_at: now,
      },
    ];
    for (const p of pinsList) {
      this.pins.set(p.pin_code, p);
    }

    // 3. Seeded Users (including Primary Admin: VedantBhagat@admin.in / Ashu@1285)
    const demoHashed = hashPassword('demo123');
    const vedantHashed = hashPassword('Ashu@1285');

    const usersList: DBUserRecord[] = [
      {
        id: 'u0000000-admin-vedant',
        username: 'VedantBhagat',
        email: 'VedantBhagat@admin.in',
        hashed_password: vedantHashed,
        role: 'ADMIN',
        brand_id: brandEco.id,
        name: 'Vedant Bhagat',
        department: 'Executive Governance & Security',
        is_approved: true,
        lobby_access: true,
        created_at: now,
      },
      {
        id: 'u0000001-0000-4000-8000-000000000001',
        username: 'admin',
        email: 'admin@ecofresh.com',
        hashed_password: demoHashed,
        role: 'ADMIN',
        brand_id: brandEco.id,
        name: 'Elena Rostova',
        department: 'Governance & Security',
        is_approved: true,
        lobby_access: true,
        created_at: now,
      },
      {
        id: 'u0000002-0000-4000-8000-000000000002',
        username: 'reviewer',
        email: 'reviewer@ecofresh.com',
        hashed_password: demoHashed,
        role: 'REVIEWER',
        brand_id: brandEco.id,
        name: 'Marcus Vance',
        department: 'Compliance Review',
        is_approved: true,
        lobby_access: true,
        created_at: now,
      },
      {
        id: 'u0000003-0000-4000-8000-000000000003',
        username: 'creator',
        email: 'creator@ecofresh.com',
        hashed_password: demoHashed,
        role: 'CREATOR',
        brand_id: brandEco.id,
        name: 'Chloe Lin',
        department: 'Brand Copywriting',
        is_approved: true,
        lobby_access: true,
        created_at: now,
      },
      {
        id: 'manager-1',
        username: 'manya',
        email: 'manya.iyer@aurelia.com',
        hashed_password: demoHashed,
        role: 'ADMIN',
        brand_id: brandAurelia.id,
        name: 'Manya Iyer',
        department: 'Governance & Legal',
        is_approved: true,
        lobby_access: true,
        created_at: now,
      },
      {
        id: 'creator-1',
        username: 'arjun',
        email: 'arjun.rao@aurelia.com',
        hashed_password: demoHashed,
        role: 'CREATOR',
        brand_id: brandAurelia.id,
        name: 'Arjun Rao',
        department: 'Marketing',
        is_approved: true,
        lobby_access: true,
        created_at: now,
      },
      {
        id: 'creator-new',
        username: 'priya',
        email: 'priya.sharma@agency.com',
        hashed_password: demoHashed,
        role: 'CREATOR',
        brand_id: brandAurelia.id,
        name: 'Priya Sharma',
        department: 'Paid Social',
        is_approved: false,
        lobby_access: false,
        created_at: now,
      },
    ];
    for (const u of usersList) {
      this.users.set(u.id, u);
    }

    // 4. Brand Guidelines (EcoFresh Botanicals from seed_data.py)
    const gLegal: BrandGuidelineRecord = {
      id: 'g0000001-0000-4000-8000-000000000001',
      brand_id: brandEco.id,
      title: 'Therapeutic & Medical Claims Prohibition',
      category: 'legal_marketing_policy',
      content:
        "EcoFresh products are natural dietary wellness supplements. Marketing content must NEVER claim that our products 'cure', 'treat', 'prevent', or offer a '100% guarantee' for any medical disease or physiological condition.",
      version: 1,
      created_at: now,
    };
    const gDisclaimer: BrandGuidelineRecord = {
      id: 'g0000002-0000-4000-8000-000000000002',
      brand_id: brandEco.id,
      title: 'Metabolism & Dietary FDA Disclaimer',
      category: 'disclaimers',
      content:
        "Any promotional copy referencing metabolism, weight, or digestive health must include: 'These statements have not been evaluated by the FDA. This product is not intended to diagnose, treat, cure, or prevent any disease.'",
      version: 1,
      created_at: now,
    };
    const gTone: BrandGuidelineRecord = {
      id: 'g0000003-0000-4000-8000-000000000003',
      brand_id: brandEco.id,
      title: 'Authentic & Transparent Tone',
      category: 'style_tone',
      content:
        "Copy must adopt an authentic, educational, and humble tone. Avoid aggressive sales urgency, fear-mongering, or hyperbolic superlatives like 'miracle cure'.",
      version: 1,
      created_at: now,
    };
    this.guidelines.set(gLegal.id, gLegal);
    this.guidelines.set(gDisclaimer.id, gDisclaimer);
    this.guidelines.set(gTone.id, gTone);

    store.addChunks(
      [
        {
          chunk_id: 'ecofresh-legal-01',
          text: gLegal.content,
          section: gLegal.title,
          page: 1,
        },
        {
          chunk_id: 'ecofresh-disclaimer-02',
          text: gDisclaimer.content,
          section: gDisclaimer.title,
          page: 1,
        },
        {
          chunk_id: 'ecofresh-tone-03',
          text: gTone.content,
          section: gTone.title,
          page: 1,
        },
      ],
      'EcoFresh_Botanicals_Compliance_Policy.md',
      'style_rule',
      '1.0',
      'marketing',
      'internal'
    );

    // 5. Seed Audit Logs
    this.logAudit({
      brand_id: brandEco.id,
      user_id: 'u0000000-admin-vedant',
      user_email: 'VedantBhagat@admin.in',
      action: 'USER_LOGIN',
      details: { username: 'VedantBhagat', email: 'VedantBhagat@admin.in', role: 'ADMIN', status: 'Primary Super Admin Provisioned' },
    });
    this.logAudit({
      brand_id: brandEco.id,
      user_id: usersList[1].id,
      user_email: 'admin@ecofresh.com',
      action: 'PIN_GENERATED',
      details: { pin_code: 'ECO-8821', brand: 'EcoFresh Botanicals', generated_by: 'admin@ecofresh.com' },
    });
    this.logAudit({
      brand_id: brandEco.id,
      user_id: usersList[3].id,
      user_email: 'creator@ecofresh.com',
      action: 'PIN_BURNED',
      details: {
        pin_code: 'ECO-0019',
        used_by_email: 'creator@ecofresh.com',
        brand: 'EcoFresh Botanicals',
      },
    });
  }

  public ensurePrimaryAdmin() {
    // Backfill lobby_access for any existing users in hot-reloaded singleton
    for (const u of this.users.values()) {
      if (typeof u.lobby_access !== 'boolean') {
        u.lobby_access = u.role === 'ADMIN' || u.role === 'REVIEWER' || Boolean(u.is_approved);
      }
    }

    // Backfill created_by_id and created_by_email on any existing pins
    for (const p of this.pins.values()) {
      if (!p.created_by_email) {
        p.created_by_id = 'u0000000-admin-vedant';
        p.created_by_email = 'VedantBhagat@admin.in';
      }
    }

    const existingVedant = this.findUserByUsernameOrEmail('VedantBhagat@admin.in');
    if (!existingVedant) {
      const now = new Date().toISOString();
      const vedantUser: DBUserRecord = {
        id: 'u0000000-admin-vedant',
        username: 'VedantBhagat',
        email: 'VedantBhagat@admin.in',
        hashed_password: hashPassword('Ashu@1285'),
        role: 'ADMIN',
        brand_id: 'b0000001-0000-4000-8000-000000000001',
        name: 'Vedant Bhagat',
        department: 'Executive Governance & Security',
        is_approved: true,
        lobby_access: true,
        created_at: now,
      };
      this.users.set(vedantUser.id, vedantUser);
    } else {
      existingVedant.role = 'ADMIN';
      existingVedant.is_approved = true;
      existingVedant.lobby_access = true;
      existingVedant.hashed_password = hashPassword('Ashu@1285');
      this.users.set(existingVedant.id, existingVedant);
    }
  }

  public findUserByIdOrIdentifier(identifier: string): DBUserRecord | undefined {
    const byId = this.users.get(identifier);
    if (byId) return byId;
    return this.findUserByUsernameOrEmail(identifier);
  }

  public findUserByEmail(email: string): DBUserRecord | undefined {
    const clean = email.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === clean) return u;
    }
    return undefined;
  }

  public findUserByUsername(username: string): DBUserRecord | undefined {
    const clean = username.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.username.toLowerCase() === clean) return u;
    }
    return undefined;
  }

  public findUserByUsernameOrEmail(identifier: string): DBUserRecord | undefined {
    const clean = identifier.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === clean || u.username.toLowerCase() === clean) {
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
    const actor = this.findUserByIdOrIdentifier(params.actorId);
    const effectiveActorRole = actor?.role || params.actorRole || 'ADMIN';

    if (effectiveActorRole !== 'ADMIN' && effectiveActorRole !== 'admin') {
      const err: any = new Error('Forbidden: Only an Admin has the right to promote or change user roles.');
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
    target.role = params.newRole;
    if (params.newRole === 'ADMIN' || params.newRole === 'REVIEWER') {
      target.is_approved = true;
      target.lobby_access = true;
    }
    this.users.set(target.id, target);

    this.logAudit({
      brand_id: target.brand_id,
      user_id: actor?.id || params.actorId,
      user_email: actor?.email || 'VedantBhagat@admin.in',
      action: 'ROLE_UPDATED',
      details: {
        target_user: target.email,
        username: target.username,
        previous_role: previousRole,
        new_role: params.newRole,
        updated_by: actor?.email || 'VedantBhagat@admin.in',
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
      user_email: actor?.email || 'VedantBhagat@admin.in',
      action: 'LOBBY_ACCESS_UPDATED',
      details: {
        target_user: target.email,
        username: target.username,
        lobby_rights: params.lobbyAccess ? 'GRANTED' : 'REVOKED',
        updated_by: actor?.email || 'VedantBhagat@admin.in',
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

  public generatePin(params: {
    adminUser: DBUserRecord;
    brandId?: string;
    prefix?: string;
  }): BrandPinRecord {
    if (params.adminUser.role !== 'ADMIN') {
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
      'system@brandlens.ai';

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
    return record;
  }
}

// Preserve singleton across Next.js hot reloads, and ensure methods/admin exist
const globalForSecurityDB = globalThis as unknown as {
  securityDB?: MultiTenantSecurityDB;
};

if (!globalForSecurityDB.securityDB || typeof globalForSecurityDB.securityDB.updateUserRole !== 'function') {
  globalForSecurityDB.securityDB = new MultiTenantSecurityDB();
} else {
  globalForSecurityDB.securityDB.ensurePrimaryAdmin();
}

export const securityDB = globalForSecurityDB.securityDB;
