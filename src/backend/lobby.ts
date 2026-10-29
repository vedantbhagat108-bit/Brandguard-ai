import fs from 'fs';
import path from 'path';
import { UserRole } from './types.ts';
import { securityDB } from './database.ts';
import { sendOtpEmail } from './emailService.ts';

export interface UserSession {
  user_id: string;
  email: string;
  role: UserRole;
  token: string;
  created_at: string;
}

export interface LobbyParticipant {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  joined_at: string;
}

export interface LobbyNoteItem {
  id: string;
  author_name: string;
  author_role: 'manager' | 'content_creator';
  text: string;
  timestamp: string;
}

export interface ReviewLobby {
  lobby_code: string;
  room_code: string;
  title: string;
  created_by: string;
  created_by_email?: string;
  manager_id: string;
  package_id?: string;
  shared_content: string;
  shared_content_draft: string;
  shared_brand_guidelines: string;
  created_at: string;
  status: 'active' | 'approved' | 'closed';
  permission_granted: boolean;
  participants: LobbyParticipant[];
  manager_approved: boolean;
  notes: LobbyNoteItem[];
  last_score?: number;
}

const LEGACY_DEMO_LOBBY_CODES = new Set(['882104', '441092']);

function getLobbiesStorageFilePath(): string {
  try {
    const localDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    return path.join(localDir, 'lobbies-db.json');
  } catch {
    return '/tmp/brandlens-lobbies-db.json';
  }
}

export function isSuperAdminUser(
  userId?: string | null,
  email?: string | null,
  securityRole?: string | null
): boolean {
  if ((securityRole || '').toUpperCase() === 'SUPER_ADMIN') {
    return true;
  }
  const cleanId = (userId || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  if (cleanId) {
    const dbById = securityDB.users.get(cleanId);
    if (dbById?.role === 'SUPER_ADMIN') return true;
  }
  if (cleanEmail) {
    const dbByEmail = securityDB.findUserByEmail(cleanEmail);
    if (dbByEmail?.role === 'SUPER_ADMIN') return true;
  }
  return false;
}

export function isRoomCreator(
  room: ReviewLobby,
  userId?: string | null,
  email?: string | null
): boolean {
  const cleanId = (userId || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  if (cleanId && room.manager_id === cleanId) return true;
  if (cleanEmail && (room.created_by_email || '').toLowerCase() === cleanEmail) return true;
  return false;
}

// In-memory sessions & lobbies preserved across route bundles
const globalForLobby = globalThis as unknown as {
  lobbySessions?: Map<string, UserSession>;
  lobbyPendingOtps?: Map<string, { otp: string; expiresAt: number; role: UserRole }>;
  reviewLobbies?: Map<string, ReviewLobby>;
  lobbiesLoadedFromDisk?: boolean;
};

const sessions =
  globalForLobby.lobbySessions ?? (globalForLobby.lobbySessions = new Map<string, UserSession>());
const pendingOtps =
  globalForLobby.lobbyPendingOtps ??
  (globalForLobby.lobbyPendingOtps = new Map<string, { otp: string; expiresAt: number; role: UserRole }>());
const lobbies =
  globalForLobby.reviewLobbies ?? (globalForLobby.reviewLobbies = new Map<string, ReviewLobby>());

function loadLobbiesFromDisk() {
  try {
    const filePath = getLobbiesStorageFilePath();
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.lobbies)) {
      for (const [code, room] of parsed.lobbies) {
        if (code && room && !LEGACY_DEMO_LOBBY_CODES.has(code)) {
          lobbies.set(code, room as ReviewLobby);
        }
      }
    }
  } catch {
    // Ignore missing or unreadable file
  }
}

function saveLobbiesToDisk() {
  try {
    const filePath = getLobbiesStorageFilePath();
    const payload = {
      lobbies: Array.from(lobbies.entries()),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // Safe fallback in read-only environments
  }
}

// Clean any legacy demo lobbies if present in memory and sync from disk
function sanitizeLobbies() {
  if (!globalForLobby.lobbiesLoadedFromDisk) {
    loadLobbiesFromDisk();
    globalForLobby.lobbiesLoadedFromDisk = true;
  }
  for (const demoCode of LEGACY_DEMO_LOBBY_CODES) {
    lobbies.delete(demoCode);
  }
  for (const room of lobbies.values()) {
    if (typeof room.permission_granted !== 'boolean') {
      room.permission_granted = room.status !== 'closed';
    }
  }
}

export function listLobbies(): ReviewLobby[] {
  sanitizeLobbies();
  return Array.from(lobbies.values());
}

export function listLobbiesForUser(params: {
  user_id?: string | null;
  email?: string | null;
  security_role?: string | null;
  role?: string | null;
}): ReviewLobby[] {
  sanitizeLobbies();
  const all = Array.from(lobbies.values());
  const userId = (params.user_id || '').trim();
  const email = (params.email || '').trim().toLowerCase();
  const secRole = (params.security_role || params.role || '').toUpperCase();

  if (!userId && !email) {
    return [];
  }

  // Super Admin sees ALL lobbies for oversight (grant/revoke permission or discard),
  // but cannot enter/access the room or view its confidential PIN
  if (isSuperAdminUser(userId, email, secRole)) {
    return all;
  }

  // Regular Admin sees ONLY lobbies created by themselves — no one else's
  if (secRole === 'ADMIN') {
    return all.filter((room) => isRoomCreator(room, userId, email));
  }

  // Managers / Creators see rooms they created or rooms they have joined via PIN
  return all.filter(
    (room) =>
      isRoomCreator(room, userId, email) ||
      (room.participants || []).some(
        (p) =>
          p.user_id === userId ||
          (Boolean(email) && (p.email || '').toLowerCase() === email)
      )
  );
}

// Generate 6-digit OTP (15 minutes expiry matching Database/email)
export function requestOtp(email: string, role: UserRole = 'content_creator') {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 15 * 60 * 1000;
  pendingOtps.set(email.toLowerCase(), { otp, expiresAt, role });

  sendOtpEmail(email, otp, 'BrandLens AI').catch(() => {});

  return {
    success: true,
    message: `OTP sent to ${email}`,
    dev_otp: otp,
  };
}

// Verify OTP & create authenticated session
export function verifyOtp(email: string, enteredOtp: string) {
  const record = pendingOtps.get(email.toLowerCase());
  if (!record) {
    throw new Error('No pending OTP request found for this email.');
  }

  if (Date.now() > record.expiresAt) {
    pendingOtps.delete(email.toLowerCase());
    throw new Error('OTP has expired. Please request a new one.');
  }

  if (record.otp !== enteredOtp.trim()) {
    throw new Error('Invalid OTP code. Please check and try again.');
  }

  pendingOtps.delete(email.toLowerCase());

  const token = `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const session: UserSession = {
    user_id: `usr_${email.split('@')[0] || 'member'}`,
    email: email.toLowerCase(),
    role: record.role,
    token,
    created_at: new Date().toISOString(),
  };

  sessions.set(token, session);

  return {
    success: true,
    token,
    user: session,
  };
}

export function getSession(token: string): UserSession | undefined {
  return sessions.get(token);
}

// Admin creates a collaborative review lobby
export function createLobby(params: {
  manager_id: string;
  manager_name?: string;
  manager_email: string;
  security_role?: string;
  title: string;
  initial_content?: string;
  brand_guidelines?: string;
  package_id?: string;
}): ReviewLobby {
  sanitizeLobbies();
  if (isSuperAdminUser(params.manager_id, params.manager_email, params.security_role)) {
    throw new Error(
      'Super Admin is for governance oversight only (grant/revoke lobby permissions or discard lobbies) and cannot create or enter lobby rooms.'
    );
  }

  const lobbyCode = Math.floor(100000 + Math.random() * 900000).toString();
  const draft = params.initial_content || '';
  const guidelines =
    params.brand_guidelines ||
    '1. Avoid unverified superlative or medical cure claims.\n2. Cite clinical sample sizes and mandatory disclaimers.';
  const now = new Date().toISOString();

  const lobby: ReviewLobby = {
    lobby_code: lobbyCode,
    room_code: lobbyCode,
    title: params.title || 'Brand Governance Review Session',
    created_by: params.manager_name
      ? `${params.manager_name} (${params.manager_email})`
      : params.manager_email,
    created_by_email: params.manager_email,
    manager_id: params.manager_id,
    package_id: params.package_id,
    shared_content: draft,
    shared_content_draft: draft,
    shared_brand_guidelines: guidelines,
    created_at: now,
    status: 'active',
    permission_granted: true,
    manager_approved: false,
    last_score: 85,
    participants: [
      {
        user_id: params.manager_id,
        name: params.manager_name || params.manager_email,
        email: params.manager_email,
        role: 'manager',
        joined_at: now,
      },
    ],
    notes: [
      {
        id: `note-${Date.now()}`,
        author_name: params.manager_name || params.manager_email,
        author_role: 'manager',
        text: 'Collaborative review room created.',
        timestamp: now,
      },
    ],
  };

  lobbies.set(lobbyCode, lobby);
  saveLobbiesToDisk();
  return lobby;
}

// Employee/Creator or Creator Admin joins an existing lobby
export function joinLobby(params: {
  lobby_code: string;
  user_id: string;
  name?: string;
  email: string;
  role: UserRole;
  security_role?: string;
}): ReviewLobby {
  sanitizeLobbies();
  if (isSuperAdminUser(params.user_id, params.email, params.security_role)) {
    throw new Error(
      'Super Admin cannot access or enter lobby rooms. Super Admin can only grant/revoke permissions or discard lobbies.'
    );
  }

  const lobby = lobbies.get(params.lobby_code.trim());
  if (!lobby) {
    throw new Error(`Review lobby code "${params.lobby_code}" does not exist.`);
  }

  if (lobby.permission_granted === false || lobby.status === 'closed') {
    throw new Error(
      'This lobby room currently has its permission suspended or has been closed by Super Admin.'
    );
  }

  // If the user is an Admin, they can ONLY access rooms created by themselves
  if (
    (params.security_role || '').toUpperCase() === 'ADMIN' &&
    !isRoomCreator(lobby, params.user_id, params.email)
  ) {
    throw new Error(
      'Admins can only access lobby rooms created by themselves.'
    );
  }

  if (
    !lobby.participants.some(
      (p) =>
        p.user_id === params.user_id ||
        (Boolean(params.email) && p.email.toLowerCase() === params.email.toLowerCase())
    )
  ) {
    lobby.participants.push({
      user_id: params.user_id,
      name: params.name || params.email,
      email: params.email,
      role: params.role,
      joined_at: new Date().toISOString(),
    });
    saveLobbiesToDisk();
  }

  return lobby;
}

export function discardLobby(lobbyCode: string): ReviewLobby {
  sanitizeLobbies();
  const code = lobbyCode.trim();
  const existing = lobbies.get(code);
  if (!existing) {
    throw new Error(`Lobby "${code}" not found.`);
  }
  lobbies.delete(code);
  saveLobbiesToDisk();
  return existing;
}

export function setLobbyPermission(lobbyCode: string, granted: boolean): ReviewLobby {
  sanitizeLobbies();
  const code = lobbyCode.trim();
  const existing = lobbies.get(code);
  if (!existing) {
    throw new Error(`Lobby "${code}" not found.`);
  }
  existing.permission_granted = granted;
  existing.status = granted ? 'active' : 'closed';
  saveLobbiesToDisk();
  return existing;
}

export function getLobby(lobbyCode: string): ReviewLobby | undefined {
  sanitizeLobbies();
  return lobbies.get(lobbyCode.trim());
}

export function updateLobbyState(params: {
  lobby_code: string;
  user_id: string;
  user_email?: string;
  security_role?: string;
  author_name?: string;
  role: UserRole;
  action: 'update_content' | 'add_note' | 'manager_approve' | 'close';
  content?: string;
  brand_guidelines?: string;
  score?: number;
  note?: string;
  package_id?: string;
}): ReviewLobby {
  sanitizeLobbies();
  if (isSuperAdminUser(params.user_id, params.user_email, params.security_role)) {
    throw new Error('Super Admin cannot access or modify inside lobby rooms.');
  }

  const lobby = lobbies.get(params.lobby_code.trim());
  if (!lobby) {
    throw new Error(`Lobby "${params.lobby_code}" not found.`);
  }

  if (lobby.permission_granted === false) {
    throw new Error('Lobby permission has been revoked by Super Admin.');
  }

  if (params.action === 'update_content') {
    if (params.content !== undefined) {
      lobby.shared_content = params.content;
      lobby.shared_content_draft = params.content;
    }
    if (params.brand_guidelines !== undefined) {
      lobby.shared_brand_guidelines = params.brand_guidelines;
    }
    if (typeof params.score === 'number') {
      lobby.last_score = params.score;
    }
    if (params.package_id) lobby.package_id = params.package_id;
  } else if (params.action === 'add_note' && params.note) {
    lobby.notes.push({
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      author_name: params.author_name || params.user_id,
      author_role:
        params.role === 'manager' || params.role === 'admin' || params.role === 'authorised_reviewer'
          ? 'manager'
          : 'content_creator',
      text: params.note,
      timestamp: new Date().toISOString(),
    });
  } else if (params.action === 'manager_approve') {
    if (params.role !== 'manager' && params.role !== 'admin' && params.role !== 'authorised_reviewer') {
      throw new Error('Only managers or reviewers can issue final lobby approval.');
    }
    lobby.manager_approved = true;
    lobby.status = 'approved';
    lobby.notes.push({
      id: `note-${Date.now()}`,
      author_name: params.author_name || params.user_id,
      author_role: 'manager',
      text: `Approved by Manager ${params.author_name || params.user_id}`,
      timestamp: new Date().toISOString(),
    });
  } else if (params.action === 'close') {
    lobby.status = 'closed';
  }

  saveLobbiesToDisk();
  return lobby;
}
