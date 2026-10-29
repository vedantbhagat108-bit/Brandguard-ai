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

export interface LobbyJoinRequest {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  note?: string;
  requested_join_code: string; // Different 6-digit joining code shown ONLY to the Admin/Manager who created the lobby
  status: 'pending' | 'accepted' | 'declined';
  requested_at: string;
  resolved_at?: string;
}

export interface ReviewLobby {
  lobby_code: string;
  room_code: string;
  // 15-minute self-destructing OTP sent to the Admin via mail
  admin_otp?: string | null;
  admin_otp_created_at?: string | null;
  admin_otp_expires_at?: number | null; // epoch ms (15 min TTL)
  admin_otp_recipient?: string | null;
  // Different 6-digit Lobby Joining Code shown ONLY to the Manager/Admin who created the lobby
  manager_join_code: string;
  join_requests: LobbyJoinRequest[];
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
export const ADMIN_OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes self-destruct

function generateDistinctSixDigitCode(exclude: Array<string | undefined | null> = []): string {
  const excludedSet = new Set(exclude.filter(Boolean).map((c) => String(c).trim()));
  for (let i = 0; i < 50; i++) {
    const candidate = Math.floor(100000 + Math.random() * 900000).toString();
    if (!excludedSet.has(candidate)) {
      return candidate;
    }
  }
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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

// Clean any legacy demo lobbies and self-destruct expired 15-min Admin OTPs
function sanitizeLobbies() {
  if (!globalForLobby.lobbiesLoadedFromDisk) {
    loadLobbiesFromDisk();
    globalForLobby.lobbiesLoadedFromDisk = true;
  }
  for (const demoCode of LEGACY_DEMO_LOBBY_CODES) {
    lobbies.delete(demoCode);
  }
  let dirty = false;
  const nowMs = Date.now();
  for (const room of lobbies.values()) {
    if (typeof room.permission_granted !== 'boolean') {
      room.permission_granted = room.status !== 'closed';
      dirty = true;
    }
    if (!room.manager_join_code) {
      room.manager_join_code = generateDistinctSixDigitCode([room.room_code, room.admin_otp]);
      dirty = true;
    }
    if (!Array.isArray(room.join_requests)) {
      room.join_requests = [];
      dirty = true;
    }
    // Self-destruct Admin OTP after 15 minutes
    if (
      room.admin_otp &&
      typeof room.admin_otp_expires_at === 'number' &&
      nowMs > room.admin_otp_expires_at
    ) {
      room.admin_otp = null;
      dirty = true;
    }
  }
  if (dirty) {
    saveLobbiesToDisk();
  }
}

export function listLobbies(): ReviewLobby[] {
  sanitizeLobbies();
  return Array.from(lobbies.values());
}

/**
 * Returns lobbies formatted for the requesting user:
 * - Super Admin sees all lobbies for governance, without secret codes.
 * - Regular Admin sees rooms created by themselves (including `manager_join_code`, `admin_otp`, and `join_requests`).
 * - Creators/Managers see rooms they have joined AND a directory of active rooms they can request to join (with `manager_join_code` and `admin_otp` hidden unless they are the room creator!).
 */
export function listLobbiesForUser(params: {
  user_id?: string | null;
  email?: string | null;
  security_role?: string | null;
  role?: string | null;
}): any[] {
  sanitizeLobbies();
  const all = Array.from(lobbies.values());
  const userId = (params.user_id || '').trim();
  const email = (params.email || '').trim().toLowerCase();
  const secRole = (params.security_role || params.role || '').toUpperCase();

  if (!userId && !email) {
    return [];
  }

  // Super Admin sees ALL lobbies for oversight (grant/revoke permission or discard),
  // but NEVER sees confidential codes or room draft content
  if (isSuperAdminUser(userId, email, secRole)) {
    return all.map((room) => ({
      ...room,
      admin_otp: null,
      manager_join_code: '••••••',
      shared_content: '',
      shared_content_draft: '',
    }));
  }

  // Regular Admin sees ONLY lobbies created by themselves — with full access to manager_join_code, admin_otp, and join_requests
  if (secRole === 'ADMIN') {
    return all.filter((room) => isRoomCreator(room, userId, email));
  }

  // Creators / Reviewers see all active lobbies in the workspace so they can either:
  // 1. Open rooms they have already joined / been accepted into
  // 2. Request the Admin for a Lobby Joining Code on rooms they haven't joined yet
  // IMPORTANT: `manager_join_code` and `admin_otp` are strictly hidden from non-creators!
  return all.map((room) => {
    const isCreator = isRoomCreator(room, userId, email);
    if (isCreator) return room;

    const isParticipant = (room.participants || []).some(
      (p) =>
        (Boolean(userId) && p.user_id === userId) ||
        (Boolean(email) && (p.email || '').toLowerCase() === email)
    );

    const myRequest = (room.join_requests || []).find(
      (r) =>
        (Boolean(userId) && r.user_id === userId) ||
        (Boolean(email) && r.email.toLowerCase() === email)
    );

    return {
      ...room,
      // Hide manager-only joining code & admin OTP from non-managers/creators
      admin_otp: null,
      manager_join_code: undefined,
      // Only expose the user's own join request metadata (without revealing the manager-only code unless the manager shares it, or show status)
      my_join_request: myRequest
        ? {
            id: myRequest.id,
            status: myRequest.status,
            requested_at: myRequest.requested_at,
            resolved_at: myRequest.resolved_at,
          }
        : null,
      join_requests: [],
      is_joined: isParticipant || myRequest?.status === 'accepted',
      // Only include draft content if already a participant or accepted
      shared_content: isParticipant || myRequest?.status === 'accepted' ? room.shared_content : '',
      shared_content_draft:
        isParticipant || myRequest?.status === 'accepted' ? room.shared_content_draft : '',
    };
  });
}

// Generate 6-digit OTP (15 minutes expiry matching Database/email)
export function requestOtp(email: string, role: UserRole = 'content_creator') {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + ADMIN_OTP_TTL_MS;
  pendingOtps.set(email.toLowerCase(), { otp, expiresAt, role });

  sendOtpEmail(email, otp, 'BrandLens AI (Self-Destructs in 15 Min)').catch(() => {});

  return {
    success: true,
    message: `15-minute self-destructing OTP sent to ${email}`,
    expires_at: expiresAt,
    ttl_minutes: 15,
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
    throw new Error('OTP has self-destructed (expired after 15 minutes). Please request a new one.');
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

// Admin creates a collaborative review lobby with:
// 1. A 15-minute self-destructing Admin OTP sent via mail
// 2. A DIFFERENT 6-digit Lobby Joining Code (`manager_join_code`) shown ONLY to the Manager/Admin
export function createLobby(params: {
  manager_id: string;
  manager_name?: string;
  manager_email: string;
  recipient_email?: string;
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

  const lobbyCode = generateDistinctSixDigitCode();
  const adminOtp = generateDistinctSixDigitCode([lobbyCode]);
  const managerJoinCode = generateDistinctSixDigitCode([lobbyCode, adminOtp]);

  const draft = params.initial_content || '';
  const guidelines = params.brand_guidelines || '';
  const now = new Date().toISOString();
  const expiresAt = Date.now() + ADMIN_OTP_TTL_MS;
  const otpRecipient = (params.recipient_email || params.manager_email || '').trim();

  if (otpRecipient) {
    sendOtpEmail(otpRecipient, adminOtp, `${params.title || 'Lobby'} (15-Min Admin OTP)`).catch(
      () => {}
    );
  }

  const lobby: ReviewLobby = {
    lobby_code: lobbyCode,
    room_code: lobbyCode,
    admin_otp: adminOtp,
    admin_otp_created_at: now,
    admin_otp_expires_at: expiresAt,
    admin_otp_recipient: otpRecipient,
    manager_join_code: managerJoinCode,
    join_requests: [],
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

// Regenerate a fresh 15-minute self-destructing Admin OTP and send via mail
export function regenerateAdminOtp(params: {
  lobby_code: string;
  user_id?: string;
  email?: string;
  recipient_email?: string;
}): ReviewLobby {
  sanitizeLobbies();
  const lobby = lobbies.get(params.lobby_code.trim());
  if (!lobby) {
    throw new Error(`Lobby "${params.lobby_code}" not found.`);
  }
  if (!isRoomCreator(lobby, params.user_id, params.email)) {
    throw new Error('Only the Admin who created this lobby can generate or email its 15-minute OTP.');
  }

  const newOtp = generateDistinctSixDigitCode([lobby.room_code, lobby.manager_join_code]);
  const now = new Date().toISOString();
  const expiresAt = Date.now() + ADMIN_OTP_TTL_MS;
  const targetEmail = (params.recipient_email || lobby.created_by_email || params.email || '').trim();

  lobby.admin_otp = newOtp;
  lobby.admin_otp_created_at = now;
  lobby.admin_otp_expires_at = expiresAt;
  lobby.admin_otp_recipient = targetEmail;

  if (targetEmail) {
    sendOtpEmail(targetEmail, newOtp, `${lobby.title} (15-Min Self-Destructing OTP)`).catch(
      () => {}
    );
  }

  saveLobbiesToDisk();
  return lobby;
}

// Creator requests the Admin for a different Lobby Joining Code / permission to join
export function requestLobbyJoinCode(params: {
  lobby_code: string;
  user_id: string;
  name?: string;
  email: string;
  role: UserRole;
  note?: string;
}): { lobby: ReviewLobby; request: LobbyJoinRequest } {
  sanitizeLobbies();
  const lobby = lobbies.get(params.lobby_code.trim());
  if (!lobby) {
    throw new Error(`Lobby "${params.lobby_code}" not found.`);
  }
  if (lobby.permission_granted === false || lobby.status === 'closed') {
    throw new Error('This lobby is currently suspended or closed.');
  }

  const cleanEmail = (params.email || '').trim().toLowerCase();
  const existingReq = lobby.join_requests.find(
    (r) =>
      (Boolean(params.user_id) && r.user_id === params.user_id) ||
      (Boolean(cleanEmail) && r.email.toLowerCase() === cleanEmail)
  );

  if (existingReq) {
    existingReq.status = 'pending';
    existingReq.note = params.note || existingReq.note;
    existingReq.requested_at = new Date().toISOString();
    if (!existingReq.requested_join_code) {
      existingReq.requested_join_code = lobby.manager_join_code;
    }
    saveLobbiesToDisk();
    return { lobby, request: existingReq };
  }

  // Generate a distinct joining code for this request (or bind to manager_join_code) shown ONLY to the Manager/Admin
  const distinctJoinCode = generateDistinctSixDigitCode([
    lobby.room_code,
    lobby.admin_otp,
    lobby.manager_join_code,
  ]);

  const newReq: LobbyJoinRequest = {
    id: `jreq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    user_id: params.user_id,
    name: params.name || params.email,
    email: params.email,
    role: params.role,
    note: params.note,
    requested_join_code: distinctJoinCode,
    status: 'pending',
    requested_at: new Date().toISOString(),
  };

  lobby.join_requests.push(newReq);
  saveLobbiesToDisk();
  return { lobby, request: newReq };
}

// Admin who created the lobby accepts or declines a Creator's join request
export function resolveLobbyJoinRequest(params: {
  lobby_code: string;
  request_id: string;
  admin_user_id?: string;
  admin_email?: string;
  approve: boolean;
}): { lobby: ReviewLobby; request: LobbyJoinRequest } {
  sanitizeLobbies();
  const lobby = lobbies.get(params.lobby_code.trim());
  if (!lobby) {
    throw new Error(`Lobby "${params.lobby_code}" not found.`);
  }
  if (!isRoomCreator(lobby, params.admin_user_id, params.admin_email)) {
    throw new Error('Only the Admin who created this lobby can accept or decline join requests.');
  }

  const reqItem = lobby.join_requests.find((r) => r.id === params.request_id);
  if (!reqItem) {
    throw new Error('Join request not found.');
  }

  reqItem.status = params.approve ? 'accepted' : 'declined';
  reqItem.resolved_at = new Date().toISOString();

  if (params.approve) {
    // Upon accepting the request from the creator, add them to participants so they can either:
    // 1. Open the room directly (accepted by the Admin who created the lobby)
    // 2. Or join through the manager's joining code (`manager_join_code` / `requested_join_code`)
    const alreadyParticipant = lobby.participants.some(
      (p) =>
        (Boolean(reqItem.user_id) && p.user_id === reqItem.user_id) ||
        (Boolean(reqItem.email) && p.email.toLowerCase() === reqItem.email.toLowerCase())
    );
    if (!alreadyParticipant) {
      lobby.participants.push({
        user_id: reqItem.user_id,
        name: reqItem.name || reqItem.email,
        email: reqItem.email,
        role: reqItem.role || 'content_creator',
        joined_at: new Date().toISOString(),
      });
    }

    lobby.notes.push({
      id: `note-${Date.now()}`,
      author_name: lobby.created_by,
      author_role: 'manager',
      text: `Admin accepted join request from ${reqItem.name} (${reqItem.email}).`,
      timestamp: new Date().toISOString(),
    });
  }

  saveLobbiesToDisk();
  return { lobby, request: reqItem };
}

// Employee/Creator or Creator Admin joins an existing lobby via:
// - Manager's Lobby Joining Code (`manager_join_code`)
// - Creator's Accepted Request Joining Code (`requested_join_code`)
// - Admin's 15-minute self-destructing OTP (`admin_otp`, if not expired)
// - Room Code (if already accepted by Admin or is the Room Creator)
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

  const enteredCode = params.lobby_code.trim();
  const cleanEmail = (params.email || '').trim().toLowerCase();

  // Find lobby by room_code, manager_join_code, admin_otp, or a join request's requested_join_code
  let lobby: ReviewLobby | undefined = lobbies.get(enteredCode);
  let matchedBy: 'room_code' | 'manager_join_code' | 'request_join_code' | 'admin_otp' =
    'room_code';

  if (!lobby) {
    for (const candidate of lobbies.values()) {
      if (candidate.manager_join_code === enteredCode) {
        lobby = candidate;
        matchedBy = 'manager_join_code';
        break;
      }
      if (candidate.admin_otp && candidate.admin_otp === enteredCode) {
        lobby = candidate;
        matchedBy = 'admin_otp';
        break;
      }
      if (
        (candidate.join_requests || []).some(
          (r) => r.requested_join_code === enteredCode && r.status === 'accepted'
        )
      ) {
        lobby = candidate;
        matchedBy = 'request_join_code';
        break;
      }
    }
  }

  if (!lobby) {
    throw new Error(
      `Invalid or expired Lobby Joining Code "${enteredCode}". Ask the room Admin for the active Lobby Joining Code or request access.`
    );
  }

  if (lobby.permission_granted === false || lobby.status === 'closed') {
    throw new Error(
      'This lobby room currently has its permission suspended or has been closed by Super Admin.'
    );
  }

  const creator = isRoomCreator(lobby, params.user_id, params.email);

  // If the user is an Admin, they can ONLY access rooms created by themselves
  if ((params.security_role || '').toUpperCase() === 'ADMIN' && !creator) {
    throw new Error('Admins can only access lobby rooms created by themselves.');
  }

  // Check if 15-min Admin OTP expired
  if (matchedBy === 'admin_otp') {
    if (
      typeof lobby.admin_otp_expires_at === 'number' &&
      Date.now() > lobby.admin_otp_expires_at
    ) {
      lobby.admin_otp = null;
      saveLobbiesToDisk();
      throw new Error(
        'This 15-minute Admin OTP has self-destructed. Please generate a new OTP or use the Manager Lobby Joining Code.'
      );
    }
  }

  // If joining by room_code (e.g., clicking "Open Room"), verify the user is either the creator, already a participant, or has an accepted join request
  const isParticipant = lobby.participants.some(
    (p) =>
      (Boolean(params.user_id) && p.user_id === params.user_id) ||
      (Boolean(cleanEmail) && p.email.toLowerCase() === cleanEmail)
  );
  const myJoinReq = (lobby.join_requests || []).find(
    (r) =>
      (Boolean(params.user_id) && r.user_id === params.user_id) ||
      (Boolean(cleanEmail) && r.email.toLowerCase() === cleanEmail)
  );

  if (
    matchedBy === 'room_code' &&
    !creator &&
    !isParticipant &&
    myJoinReq?.status !== 'accepted'
  ) {
    throw new Error(
      'To join this room, please request access from the Admin or enter the Manager-Only Lobby Joining Code.'
    );
  }

  if (!isParticipant) {
    lobby.participants.push({
      user_id: params.user_id,
      name: params.name || params.email,
      email: params.email,
      role: params.role,
      joined_at: new Date().toISOString(),
    });
    if (myJoinReq && myJoinReq.status !== 'accepted') {
      myJoinReq.status = 'accepted';
      myJoinReq.resolved_at = new Date().toISOString();
    }
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
