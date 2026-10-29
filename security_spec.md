# BrandLens AI — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants & Master Source of Truth
1. **Default-Deny Catch-All**: Every path not explicitly matched is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity**: All write operations require an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`), or the bootstrapped administrator (`ash258296@gmail.com` with `email_verified == true` or existence in `/admins/$(request.auth.uid)`).
3. **PII Split Collection Isolation**:
   - `/users/{userId}` stores ONLY non-PII profile fields (`userId`, `ownerUid`, `username`, `name`, `role`, `brand_id`, `brand_name`, `department`, `is_approved`, `lobby_access`, `createdAt`, `updatedAt`).
   - `/users/{userId}/private/{docId}` isolates PII (`email`, `hashed_password`) and is strictly readable/writable ONLY by `isOwner(userId)` (verified via parent `/users/{userId}` Master Gate) or `isAdmin()`.
4. **Privilege Escalation Prevention**: Non-admin users creating their `/users/{userId}` profile MUST set `role == 'CREATOR'`; they cannot self-assign `'ADMIN'` or `'REVIEWER'`, nor can they modify `role`, `userId`, `ownerUid`, or `createdAt` during updates.
5. **Temporal Integrity**: `createdAt == request.time` on `create` and `updatedAt == request.time` on `update`.
6. **Terminal State Locking**: Once a `/workspaces/{workspaceId}` document transitions to `status == 'archived'`, non-admin updates are permanently blocked.

---

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Payload 01 (Shadow Field Injection)**: Create `/users/usr_1` with required fields plus `{ "isSuperAdmin": true }` -> **REJECTED** (`hasOnly` check fails).
2. **Payload 02 (Self-Assigned Admin Escalation)**: Non-admin creates `/users/usr_1` with `{ "role": "ADMIN" }` -> **REJECTED** (non-admin must set `role == 'CREATOR'`).
3. **Payload 03 (Identity Spoofing on Create)**: User `uid_A` creates `/users/usr_1` with `{ "ownerUid": "uid_B" }` -> **REJECTED** (`incoming().ownerUid == request.auth.uid` fails).
4. **Payload 04 (Unverified Email Spoof)**: User with `email: "ash258296@gmail.com"` but `email_verified: false` attempts admin write to `/admins/uid_A` -> **REJECTED** (`email_verified == true` required).
5. **Payload 05 (PII Lateral Read)**: Authenticated user `uid_B` attempts `get` on `/users/usr_A/private/info` owned by `uid_A` -> **REJECTED** (Master Gate + `ownerUid == request.auth.uid` fails).
6. **Payload 06 (Orphaned Subcollection Write)**: User attempts to create `/users/non_existent/private/info` when parent `/users/non_existent` does not exist -> **REJECTED** (`exists(/databases/$(database)/documents/users/$(userId))` Master Gate fails).
7. **Payload 07 (Immortal Field Mutation)**: Owner updates `/users/usr_1` and mutates `createdAt` or `ownerUid` -> **REJECTED** (`affectedKeys().hasOnly(...)` and immutability gate fail).
8. **Payload 08 (Client Timestamp Forgery)**: User creates `/users/usr_1` with a forged past/future `createdAt` timestamp instead of `request.time` -> **REJECTED** (`incoming().createdAt == request.time` fails).
9. **Payload 09 (Path Variable ID Poisoning)**: User attempts `create` at `/users/bad$id!@#` -> **REJECTED** (`isValidId(userId)` regex fails).
10. **Payload 10 (Value Poisoning on Update)**: Owner updates whitelisted field `name` with a 5,000-character string or boolean -> **REJECTED** (`isValidUserPublicProfile(incoming())` wraps update block).
11. **Payload 11 (Terminal State Bypass)**: Non-admin attempts to update `/workspaces/ws_1` after `existing().status == 'archived'` -> **REJECTED** (`existing().status != 'archived'` terminal lock fails).
12. **Payload 12 (Blanket List Scraping)**: Authenticated user attempts an unconstrained `list` query on `/users` without filtering `ownerUid == request.auth.uid` -> **REJECTED** (`resource.data.ownerUid == request.auth.uid` query enforcer fails).
