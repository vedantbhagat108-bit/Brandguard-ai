import { NextRequest, NextResponse } from 'next/server';
import { updateAccessGrant } from '@/backend/accessControl.ts';
import { securityDB, DBRole } from '@/backend/database.ts';
import { UserRole } from '@/backend/types.ts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const callerRole = (req.headers.get('x-user-role') as UserRole) || 'manager';
    const callerSecurityRole = req.headers.get('x-security-role') || 'ADMIN';
    const managerId = req.headers.get('x-user-id') || 'system';
    const body = await req.json();
    const {
      target_user_id,
      action,
      new_role,
      requested_role,
      note,
      email,
      name,
      department,
    } = body;

    if (!action) {
      return NextResponse.json(
        { error: 'action is required' },
        { status: 400 }
      );
    }

    // 0. User requests Super Admin to change their role
    if (action === 'request_role_change') {
      const desiredRole = (requested_role || new_role || '').toUpperCase();
      if (!['ADMIN', 'REVIEWER', 'CREATOR'].includes(desiredRole)) {
        return NextResponse.json(
          { error: 'Valid requested_role (ADMIN | REVIEWER | CREATOR) is required.' },
          { status: 400 }
        );
      }

      const updatedUser = securityDB.requestRoleChange({
        userId: target_user_id || managerId,
        userEmail: email,
        userName: name,
        requestedRole: desiredRole as 'ADMIN' | 'REVIEWER' | 'CREATOR',
        note,
      });

      return NextResponse.json({
        success: true,
        user: updatedUser,
        message: `Role change request (${desiredRole}) submitted to Super Admin.`,
      });
    }

    if (!target_user_id) {
      return NextResponse.json(
        { error: 'target_user_id is required' },
        { status: 400 }
      );
    }

    // 1a. Super Admin approves or declines a user's pending role request
    if (action === 'approve_role_request' || action === 'reject_role_request') {
      const approve = action === 'approve_role_request';
      const updatedUser = securityDB.resolveRoleChangeRequest({
        actorId: managerId,
        actorRole: callerSecurityRole,
        targetIdentifier: target_user_id,
        approve,
      });

      if (approve) {
        updateAccessGrant({
          manager_id: managerId,
          manager_role: 'admin',
          target_user_id: updatedUser.id,
          action: 'approve',
        });
      }

      return NextResponse.json({
        success: true,
        user: updatedUser,
        message: approve
          ? `Approved role change for ${updatedUser.name} (${updatedUser.email}) -> ${updatedUser.role}.`
          : `Declined role change request for ${updatedUser.name} (${updatedUser.email}).`,
      });
    }

    // 1b. Admin / Super Admin Role Promotion / Demotion (reflects immediately)
    if (action === 'update_role') {
      if (!new_role || !['SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'CREATOR'].includes(new_role)) {
        return NextResponse.json(
          { error: 'Valid new_role (SUPER_ADMIN | ADMIN | REVIEWER | CREATOR) is required.' },
          { status: 400 }
        );
      }

      const updatedUser = securityDB.updateUserRole({
        actorId: managerId,
        actorRole: callerSecurityRole,
        targetIdentifier: target_user_id,
        newRole: new_role as DBRole,
      });

      // Keep accessGrants in sync
      updateAccessGrant({
        manager_id: managerId,
        manager_role: 'admin',
        target_user_id: updatedUser.id,
        action: 'approve',
      });

      return NextResponse.json({
        success: true,
        user: updatedUser,
        message: `${updatedUser.name} (@${updatedUser.username}) role updated to ${updatedUser.role}.`,
      });
    }

    // 2. Grant or Revoke Employee / Creator Lobby Rights (Allowed for both Admin and Manager)
    if (action === 'grant_lobby' || action === 'revoke_lobby') {
      const allowLobby = action === 'grant_lobby';
      const updatedGrant = updateAccessGrant({
        manager_id: managerId,
        manager_role: callerRole,
        target_user_id,
        action,
        department,
      });

      const dbUser = securityDB.findUserByIdOrIdentifier(target_user_id);
      if (dbUser) {
        securityDB.updateUserLobbyAccess({
          actorId: managerId,
          actorRole: callerSecurityRole,
          targetIdentifier: dbUser.id,
          lobbyAccess: allowLobby,
        });
      }

      return NextResponse.json({
        success: true,
        grant: updatedGrant,
        lobby_access: allowLobby,
        message: allowLobby
          ? `Lobby rights granted to ${dbUser?.name || target_user_id}.`
          : `Lobby rights revoked for ${dbUser?.name || target_user_id}.`,
      });
    }

    // 3. Standard Database Access Approve / Revoke
    const updated = updateAccessGrant({
      manager_id: managerId,
      manager_role: callerRole,
      target_user_id,
      action,
      department,
    });

    return NextResponse.json({ success: true, grant: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Access operation failed' },
      { status: err.status || 403 }
    );
  }
}
