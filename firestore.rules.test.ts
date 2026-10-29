/**
 * BrandLens AI — Firestore Security Rules Test Suite (Dirty Dozen Verification)
 */
export interface SimulatedRuleContext {
  auth: {
    uid: string;
    token: {
      email?: string;
      email_verified?: boolean;
    };
  } | null;
  requestTimeIso: string;
  existingDocs: Record<string, Record<string, any>>;
}

export const DIRTY_DOZEN_PAYLOADS = [
  {
    id: 'PAYLOAD_01_SHADOW_FIELD',
    operation: 'create',
    path: '/users/usr_1',
    auth: { uid: 'uid_1', token: { email: 'user1@ecofresh.com', email_verified: true } },
    data: {
      userId: 'usr_1',
      ownerUid: 'uid_1',
      username: 'user1',
      name: 'User One',
      role: 'CREATOR',
      brand_id: 'b0000001-0000-4000-8000-000000000001',
      brand_name: 'EcoFresh Botanicals',
      department: 'Marketing',
      is_approved: true,
      lobby_access: true,
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
      isSuperAdmin: true, // Ghost field
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'PAYLOAD_02_SELF_ASSIGNED_ADMIN',
    operation: 'create',
    path: '/users/usr_1',
    auth: { uid: 'uid_1', token: { email: 'user1@ecofresh.com', email_verified: true } },
    data: {
      userId: 'usr_1',
      ownerUid: 'uid_1',
      username: 'user1',
      name: 'User One',
      role: 'ADMIN', // Escalation attempt
      brand_id: 'b0000001-0000-4000-8000-000000000001',
      brand_name: 'EcoFresh Botanicals',
      department: 'Marketing',
      is_approved: true,
      lobby_access: true,
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'PAYLOAD_03_IDENTITY_SPOOF_CREATE',
    operation: 'create',
    path: '/users/usr_1',
    auth: { uid: 'uid_1', token: { email: 'user1@ecofresh.com', email_verified: true } },
    data: {
      userId: 'usr_1',
      ownerUid: 'uid_2', // Spoofed ownerUid
      username: 'user1',
      name: 'User One',
      role: 'CREATOR',
      brand_id: 'b0000001-0000-4000-8000-000000000001',
      brand_name: 'EcoFresh Botanicals',
      department: 'Marketing',
      is_approved: true,
      lobby_access: true,
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'PAYLOAD_04_UNVERIFIED_ADMIN_EMAIL',
    operation: 'create',
    path: '/admins/uid_1',
    auth: { uid: 'uid_1', token: { email: 'ash258296@gmail.com', email_verified: false } },
    data: {
      uid: 'uid_1',
      role: 'ADMIN',
      createdAt: 'REQUEST_TIME',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'PAYLOAD_05_LATERAL_PII_READ',
    operation: 'get',
    path: '/users/usr_1/private/info',
    auth: { uid: 'uid_2', token: { email: 'attacker@ecofresh.com', email_verified: true } },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'PAYLOAD_06_ORPHANED_SUBCOLLECTION_WRITE',
    operation: 'create',
    path: '/users/non_existent/private/info',
    auth: { uid: 'uid_1', token: { email: 'user1@ecofresh.com', email_verified: true } },
    data: {
      userId: 'non_existent',
      ownerUid: 'uid_1',
      email: 'user1@ecofresh.com',
      hashed_password: 'a'.repeat(64),
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'PAYLOAD_07_IMMORTAL_FIELD_MUTATION',
    operation: 'update',
    path: '/users/usr_1',
    auth: { uid: 'uid_1', token: { email: 'user1@ecofresh.com', email_verified: true } },
    data: {
      ownerUid: 'uid_hijacked',
      updatedAt: 'REQUEST_TIME',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'PAYLOAD_08_FORGED_CLIENT_TIMESTAMP',
    operation: 'create',
    path: '/users/usr_1',
    auth: { uid: 'uid_1', token: { email: 'user1@ecofresh.com', email_verified: true } },
    data: {
      userId: 'usr_1',
      ownerUid: 'uid_1',
      username: 'user1',
      name: 'User One',
      role: 'CREATOR',
      brand_id: 'b0000001-0000-4000-8000-000000000001',
      brand_name: 'EcoFresh Botanicals',
      department: 'Marketing',
      is_approved: true,
      lobby_access: true,
      createdAt: '2020-01-01T00:00:00.000Z', // Not request.time
      updatedAt: 'REQUEST_TIME',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'PAYLOAD_09_ID_POISONING',
    operation: 'create',
    path: '/users/bad$id!@#',
    auth: { uid: 'uid_1', token: { email: 'user1@ecofresh.com', email_verified: true } },
    data: {},
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'PAYLOAD_10_VALUE_POISONING_UPDATE',
    operation: 'update',
    path: '/users/usr_1',
    auth: { uid: 'uid_1', token: { email: 'user1@ecofresh.com', email_verified: true } },
    data: {
      name: 'X'.repeat(5000), // Exceeds maxLength 100
      updatedAt: 'REQUEST_TIME',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'PAYLOAD_11_TERMINAL_STATE_BYPASS',
    operation: 'update',
    path: '/workspaces/ws_archived',
    auth: { uid: 'uid_1', token: { email: 'user1@ecofresh.com', email_verified: true } },
    data: {
      brand_name: 'Mutated After Archive',
      updatedAt: 'REQUEST_TIME',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'PAYLOAD_12_BLANKET_LIST_SCRAPE',
    operation: 'list',
    path: '/users',
    auth: { uid: 'uid_2', token: { email: 'scraper@ecofresh.com', email_verified: true } },
    resourceOwnerUid: 'uid_1', // Query attempting to read another user's doc
    expected: 'PERMISSION_DENIED',
  },
] as const;
