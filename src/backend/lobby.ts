import { UserRole } from './types.ts';

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
  participants: LobbyParticipant[];
  manager_approved: boolean;
  notes: LobbyNoteItem[];
  last_score?: number;
}

// In-memory sessions & lobbies
const sessions = new Map<string, UserSession>();
const pendingOtps = new Map<string, { otp: string; expiresAt: number; role: UserRole }>();
const lobbies = new Map<string, ReviewLobby>();

// Seed default collaborative review lobbies
function ensureDefaultLobbies() {
  if (lobbies.size > 0) return;
  const now = new Date().toISOString();
  lobbies.set('882104', {
    lobby_code: '882104',
    room_code: '882104',
    title: 'EcoFresh — Miracle Metabolism Drops Live Governance Room',
    created_by: 'Vedant Bhagat (VedantBhagat@admin.in)',
    created_by_email: 'VedantBhagat@admin.in',
    manager_id: 'u0000000-admin-vedant',
    package_id: 'rev_ecofresh_miracle',
    shared_brand_guidelines:
      "1. Never claim products 'cure', 'treat', 'prevent', or offer a '100% guarantee' for any medical condition.\n2. Any metabolism or digestive claim must include the mandatory FDA disclaimer.\n3. Maintain an authentic, educational, and scientifically grounded tone.",
    shared_content:
      'Our new herbal drops are a 100% guarantee cure for slow metabolism and will eliminate all digestive fatigue within 24 hours!',
    shared_content_draft:
      'Our new herbal drops are a 100% guarantee cure for slow metabolism and will eliminate all digestive fatigue within 24 hours!',
    created_at: now,
    status: 'active',
    manager_approved: false,
    last_score: 24,
    participants: [
      {
        user_id: 'u0000001-0000-4000-8000-000000000001',
        name: 'Elena Rostova',
        email: 'admin@ecofresh.com',
        role: 'manager',
        joined_at: now,
      },
      {
        user_id: 'u0000002-0000-4000-8000-000000000002',
        name: 'Marcus Vance',
        email: 'reviewer@ecofresh.com',
        role: 'authorised_reviewer',
        joined_at: now,
      },
      {
        user_id: 'u0000003-0000-4000-8000-000000000003',
        name: 'Chloe Lin',
        email: 'creator@ecofresh.com',
        role: 'content_creator',
        joined_at: now,
      },
    ],
    notes: [
      {
        id: 'note-eco-1',
        author_name: 'Marcus Vance (Reviewer)',
        author_role: 'manager',
        text: 'Please replace "100% guarantee cure" with "supports healthy natural digestive wellness" and append the mandatory FDA disclaimer.',
        timestamp: now,
      },
    ],
  });

  lobbies.set('441092', {
    lobby_code: '441092',
    room_code: '441092',
    title: 'Aurelia Skin — Glow Renewal Serum Launch Copy',
    created_by: 'Vedant Bhagat (VedantBhagat@admin.in)',
    created_by_email: 'VedantBhagat@admin.in',
    manager_id: 'u0000000-admin-vedant',
    package_id: 'rev_glow_serum',
    shared_brand_guidelines:
      '1. Never claim instant overnight wrinkle erasure or 100% clinical results.\n2. Always cite clinical study sample size (n=48, 8 weeks).\n3. Include #AureliaPartner disclosure for creator captions.',
    shared_content:
      'Partnering with Aurelia Skin on the new Glow Renewal Serum! Clinically proven to erase 100% of wrinkles overnight.',
    shared_content_draft:
      'Partnering with Aurelia Skin on the new Glow Renewal Serum! Clinically proven to erase 100% of wrinkles overnight.',
    created_at: now,
    status: 'active',
    manager_approved: false,
    last_score: 46,
    participants: [
      {
        user_id: 'u0000000-admin-vedant',
        name: 'Vedant Bhagat',
        email: 'VedantBhagat@admin.in',
        role: 'manager',
        joined_at: now,
      },
    ],
    notes: [
      {
        id: 'note-aur-1',
        author_name: 'Vedant Bhagat',
        author_role: 'manager',
        text: 'Collaborative review room initialized. Room PIN is confidential and visible only to the Admin creator.',
        timestamp: now,
      },
    ],
  });
}

export function listLobbies(): ReviewLobby[] {
  ensureDefaultLobbies();
  for (const room of lobbies.values()) {
    if (!room.created_by_email) {
      room.created_by_email = 'VedantBhagat@admin.in';
      room.manager_id = room.manager_id || 'u0000000-admin-vedant';
    }
    if (Array.isArray(room.notes)) {
      room.notes = room.notes.map((n) => ({
        ...n,
        text: (n.text || '')
          .replace(/Created 6-digit OTP Review Room #[A-Za-z0-9-]+/gi, 'Collaborative review room initialized. Room PIN is confidential and visible only to the Admin creator')
          .replace(/Share 6-digit OTP code [A-Za-z0-9-]+ with creator/gi, 'Room PIN is confidential and visible only to the Admin creator'),
      }));
    }
  }
  return Array.from(lobbies.values());
}

// Generate 6-digit OTP
export function requestOtp(email: string, role: UserRole = 'content_creator') {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000;
  pendingOtps.set(email.toLowerCase(), { otp, expiresAt, role });

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

// Manager creates a collaborative review lobby
export function createLobby(params: {
  manager_id: string;
  manager_name?: string;
  manager_email: string;
  title: string;
  initial_content?: string;
  brand_guidelines?: string;
  package_id?: string;
}): ReviewLobby {
  ensureDefaultLobbies();
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
    created_by: params.manager_name || params.manager_email,
    created_by_email: params.manager_email,
    manager_id: params.manager_id,
    package_id: params.package_id,
    shared_content: draft,
    shared_content_draft: draft,
    shared_brand_guidelines: guidelines,
    created_at: now,
    status: 'active',
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
        text: 'Collaborative review room initialized. Room PIN is confidential and visible only to the Admin creator.',
        timestamp: now,
      },
    ],
  };

  lobbies.set(lobbyCode, lobby);
  return lobby;
}

// Employee/Creator joins an existing lobby
export function joinLobby(params: {
  lobby_code: string;
  user_id: string;
  name?: string;
  email: string;
  role: UserRole;
}): ReviewLobby {
  ensureDefaultLobbies();
  const lobby = lobbies.get(params.lobby_code.trim());
  if (!lobby) {
    throw new Error(`Review lobby code "${params.lobby_code}" does not exist.`);
  }

  if (lobby.status === 'closed') {
    throw new Error('This review session has been closed.');
  }

  if (!lobby.participants.some((p) => p.user_id === params.user_id)) {
    lobby.participants.push({
      user_id: params.user_id,
      name: params.name || params.email,
      email: params.email,
      role: params.role,
      joined_at: new Date().toISOString(),
    });
  }

  return lobby;
}

export function getLobby(lobbyCode: string): ReviewLobby | undefined {
  ensureDefaultLobbies();
  return lobbies.get(lobbyCode.trim());
}

export function updateLobbyState(params: {
  lobby_code: string;
  user_id: string;
  author_name?: string;
  role: UserRole;
  action: 'update_content' | 'add_note' | 'manager_approve' | 'close';
  content?: string;
  brand_guidelines?: string;
  score?: number;
  note?: string;
  package_id?: string;
}): ReviewLobby {
  ensureDefaultLobbies();
  const lobby = lobbies.get(params.lobby_code.trim());
  if (!lobby) {
    throw new Error(`Lobby "${params.lobby_code}" not found.`);
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

  return lobby;
}
