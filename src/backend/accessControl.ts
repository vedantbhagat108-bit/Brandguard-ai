import { UserRole } from './types.ts';
import { securityDB } from './database.ts';

export type AccessStatus = 'not_requested' | 'pending' | 'approved' | 'revoked';

export interface AccessGrant {
  user_id: string;
  email: string;
  name?: string;
  username?: string;
  role: UserRole;
  security_role?: 'SUPER_ADMIN' | 'ADMIN' | 'REVIEWER' | 'CREATOR';
  department: string;
  status: AccessStatus;
  lobby_access: boolean;
  requested_at: string;
  granted_by?: string;
  granted_at?: string;
}

const globalForAccessGrants = globalThis as unknown as {
  accessGrantsMap?: Map<string, AccessGrant>;
};

const accessGrants =
  globalForAccessGrants.accessGrantsMap ??
  (globalForAccessGrants.accessGrantsMap = new Map<string, AccessGrant>());

function syncGrantsFromSecurityDB() {
  securityDB.loadFromDisk();
  securityDB.purgeLegacyDemoRecords();
  for (const key of Array.from(accessGrants.keys())) {
    if (!securityDB.users.has(key)) {
      const existing = accessGrants.get(key);
      if (existing && securityDB.findUserByEmail(existing.email) === undefined) {
        accessGrants.delete(key);
      }
    }
  }

  for (const u of securityDB.users.values()) {
    const existing = accessGrants.get(u.id);
    const mappedRole: UserRole =
      u.role === 'SUPER_ADMIN' || u.role === 'ADMIN'
        ? 'admin'
        : u.role === 'REVIEWER'
        ? 'authorised_reviewer'
        : 'content_creator';

    if (!existing) {
      accessGrants.set(u.id, {
        user_id: u.id,
        email: u.email,
        name: u.name,
        username: u.username,
        role: mappedRole,
        security_role: u.role,
        department: u.department,
        status: u.is_approved ? 'approved' : 'pending',
        lobby_access: typeof u.lobby_access === 'boolean' ? u.lobby_access : true,
        requested_at: u.created_at,
        granted_by: u.is_approved ? 'system' : undefined,
        granted_at: u.is_approved ? u.created_at : undefined,
      });
    } else {
      existing.email = u.email;
      existing.name = u.name;
      existing.username = u.username;
      existing.role = mappedRole;
      existing.security_role = u.role;
      existing.status = u.is_approved ? 'approved' : existing.status;
      existing.lobby_access =
        typeof u.lobby_access === 'boolean' ? u.lobby_access : existing.lobby_access;
    }
  }
}

syncGrantsFromSecurityDB();

export function checkUserDatabaseAccess(
  userId: string = '',
  userRole: UserRole = 'content_creator'
): { allowed: boolean; status: AccessStatus; lobby_access: boolean; message?: string } {
  syncGrantsFromSecurityDB();

  if (userRole === 'manager' || userRole === 'admin' || userRole === 'authorised_reviewer') {
    return { allowed: true, status: 'approved', lobby_access: true };
  }

  const dbUser = securityDB.findUserByIdOrIdentifier(userId);
  const grant = accessGrants.get(dbUser?.id || userId);
  const lobbyAllowed = dbUser ? dbUser.lobby_access !== false : grant ? grant.lobby_access !== false : true;

  if (!grant || grant.status !== 'approved') {
    const currentStatus: AccessStatus = grant ? grant.status : 'not_requested';
    return {
      allowed: false,
      status: currentStatus,
      lobby_access: lobbyAllowed,
      message:
        currentStatus === 'pending'
          ? 'Database access request is pending manager authorization.'
          : currentStatus === 'revoked'
          ? 'Database access has been revoked by a manager.'
          : 'Database access has not been requested yet. Please request approval from a manager.',
    };
  }

  return { allowed: true, status: 'approved', lobby_access: lobbyAllowed };
}

export function requestDatabaseAccess(params: {
  user_id: string;
  email: string;
  department?: string;
  role?: UserRole;
}): AccessGrant {
  syncGrantsFromSecurityDB();
  const existing = accessGrants.get(params.user_id);
  if (existing && existing.status === 'approved') {
    return existing;
  }

  const grant: AccessGrant = {
    user_id: params.user_id,
    email: params.email,
    role: params.role || 'content_creator',
    security_role: 'CREATOR',
    department: params.department || 'marketing',
    status: 'pending',
    lobby_access: true,
    requested_at: new Date().toISOString(),
  };

  accessGrants.set(params.user_id, grant);
  return grant;
}

export function getAccessStatus(userId: string, email?: string | null) {
  syncGrantsFromSecurityDB();
  let dbUser =
    securityDB.findUserByIdOrIdentifier(userId) ||
    (email ? securityDB.findUserByEmail(email) : undefined);

  // If an authenticated user with an email is not yet in securityDB, provision them with lobby_access: true
  if (!dbUser && email && email.includes('@')) {
    const cleanEmail = email.trim().toLowerCase();
    const isSuper = cleanEmail === 'admin@gmail.com';
    const defaultBrandId = isSuper
      ? 'b0000000-0000-4000-8000-000000000000'
      : 'b0000001-0000-4000-8000-000000000001';
    const workspaceName =
      securityDB.workspaces.get(defaultBrandId)?.name || 'Default Workspace';
    dbUser = {
      id: userId || `usr_${Date.now()}`,
      username: cleanEmail.split('@')[0],
      email: cleanEmail,
      hashed_password: 'session_user',
      role: isSuper ? 'SUPER_ADMIN' : 'CREATOR',
      brand_id: defaultBrandId,
      brand_name: workspaceName,
      name: cleanEmail.split('@')[0],
      department: 'Marketing',
      is_approved: true,
      lobby_access: true,
      created_at: new Date().toISOString(),
    };
    securityDB.users.set(dbUser.id, dbUser);
    securityDB.saveToDisk();
    syncGrantsFromSecurityDB();
  }

  const grant = accessGrants.get(dbUser?.id || userId);
  const isApproved = dbUser ? Boolean(dbUser.is_approved) : grant ? grant.status === 'approved' : true;
  const lobbyAccess = dbUser
    ? dbUser.lobby_access !== false
    : grant
    ? grant.lobby_access !== false
    : true;

  const workspaceName = dbUser
    ? dbUser.brand_name || securityDB.workspaces.get(dbUser.brand_id)?.name || 'Default Workspace'
    : 'Default Workspace';

  return {
    is_approved: isApproved,
    lobby_access: lobbyAccess,
    role: dbUser?.role || grant?.security_role || 'CREATOR',
    user: dbUser
      ? {
          id: dbUser.id,
          username: dbUser.username,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
          brand_id: dbUser.brand_id,
          brand_name: workspaceName,
          department: dbUser.department,
          is_approved: dbUser.is_approved,
          lobby_access: dbUser.lobby_access !== false,
          requested_role: dbUser.requested_role || null,
          role_request_status: dbUser.role_request_status || null,
          role_request_note: dbUser.role_request_note || null,
          role_request_at: dbUser.role_request_at || null,
        }
      : undefined,
    grant,
  };
}

export function listPendingRequests(managerRole: UserRole): AccessGrant[] {
  syncGrantsFromSecurityDB();
  if (
    managerRole !== 'manager' &&
    managerRole !== 'admin' &&
    managerRole !== 'authorised_reviewer'
  ) {
    throw new Error('Forbidden: Only managers can view access authorization requests.');
  }

  return Array.from(accessGrants.values()).filter((g) => g.status === 'pending');
}

export function listAllGrants(managerRole: UserRole): AccessGrant[] {
  syncGrantsFromSecurityDB();
  if (
    managerRole !== 'manager' &&
    managerRole !== 'admin' &&
    managerRole !== 'authorised_reviewer'
  ) {
    throw new Error('Forbidden: Only managers can manage access rights.');
  }

  return Array.from(accessGrants.values());
}

export function updateAccessGrant(params: {
  manager_id: string;
  manager_role: UserRole;
  target_user_id: string;
  action: 'approve' | 'revoke' | 'grant_lobby' | 'revoke_lobby';
  department?: string;
}): AccessGrant {
  syncGrantsFromSecurityDB();
  if (
    params.manager_role !== 'manager' &&
    params.manager_role !== 'admin' &&
    params.manager_role !== 'authorised_reviewer'
  ) {
    throw new Error('Unauthorized: Only an Admin or Manager can manage access and lobby rights.');
  }

  const dbUser = securityDB.findUserByIdOrIdentifier(params.target_user_id);
  let grant = accessGrants.get(dbUser?.id || params.target_user_id);

  if (!grant) {
    grant = {
      user_id: dbUser?.id || params.target_user_id,
      email: dbUser?.email || '',
      name: dbUser?.name,
      username: dbUser?.username,
      role: 'content_creator',
      security_role: dbUser?.role || 'CREATOR',
      department: params.department || dbUser?.department || 'marketing',
      status: 'pending',
      lobby_access: false,
      requested_at: new Date().toISOString(),
    };
  }

  if (params.action === 'approve' || params.action === 'revoke') {
    grant.status = params.action === 'approve' ? 'approved' : 'revoked';
    if (params.action === 'approve') {
      grant.lobby_access = true;
    } else {
      grant.lobby_access = false;
    }
    if (dbUser) {
      dbUser.is_approved = params.action === 'approve';
      dbUser.lobby_access = grant.lobby_access;
      securityDB.users.set(dbUser.id, dbUser);
      securityDB.logAudit({
        brand_id: dbUser.brand_id,
        user_id: params.manager_id,
        user_email: securityDB.findUserByIdOrIdentifier(params.manager_id)?.email || 'system',
        action: 'STATUS_UPDATED',
        details: {
          target_user: dbUser.email,
          access_status: grant.status,
          lobby_access: grant.lobby_access ? 'GRANTED' : 'REVOKED',
        },
      });
    }
  } else if (params.action === 'grant_lobby' || params.action === 'revoke_lobby') {
    const allowLobby = params.action === 'grant_lobby';
    grant.lobby_access = allowLobby;
    if (dbUser) {
      securityDB.updateUserLobbyAccess({
        actorId: params.manager_id,
        actorRole: 'ADMIN',
        targetIdentifier: dbUser.id,
        lobbyAccess: allowLobby,
      });
    }
  }

  grant.granted_by = params.manager_id;
  grant.granted_at = new Date().toISOString();
  if (params.department) grant.department = params.department;

  accessGrants.set(grant.user_id, grant);
  return grant;
}
