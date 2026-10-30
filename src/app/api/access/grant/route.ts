import { NextRequest, NextResponse } from 'next/server';
import { updateAccessGrant } from '@/backend/accessControl.ts';
import { securityDB, DBRole, decodeAccessToken } from '@/backend/database.ts';
import { UserRole } from '@/backend/types.ts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await securityDB.syncFromCloud(true);

    const callerRole = (req.headers.get('x-user-role') as UserRole) || 'manager';
    const callerSecurityRole = req.headers.get('x-security-role') || 'ADMIN';
    let managerId = req.headers.get('x-user-id') || '';

    const authHeader = req.headers.get('authorization');
    if (!managerId && authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      try {
        const decoded = decodeAccessToken(authHeader.slice(7).trim());
        managerId = decoded.sub;
      } catch {}
    }

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
      actor_id,
    } = body;

    const effectiveActorId = managerId || actor_id || 'system';

    if (!action) {
      return NextResponse.json(
        { error: 'action is required' },
        { status: 400 }
      );
    }

    if (action === 'reset_demo_data') {
      const resetUsers = securityDB.resetDemoDataOnly(effectiveActorId);
      await securityDB.saveToCloud();
      return NextResponse.json({
        success: true,
        reset_users: resetUsers,
        message: 'Demo accounts reset without affecting real users or workspaces.',
      });
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
        userId: target_user_id || effectiveActorId,
        userEmail: email,
        userName: name,
        requestedRole: desiredRole as 'ADMIN' | 'REVIEWER' | 'CREATOR',
        note,
      });

      await securityDB.saveToCloud();

      return NextResponse.json({
        success: true,
        user: updatedUser,
        version: updatedUser.version || 1,
        updated_at: updatedUser.updated_at,
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
        actorId: effectiveActorId,
        actorRole: callerSecurityRole,
        targetIdentifier: target_user_id,
        approve,
      });

      if (approve) {
        updateAccessGrant({
          manager_id: effectiveActorId,
          manager_role: 'admin',
          target_user_id: updatedUser.id,
          action: 'approve',
        });
      }

      await securityDB.saveToCloud();

      return NextResponse.json({
        success: true,
        user: updatedUser,
        version: updatedUser.version || 1,
        updated_at: updatedUser.updated_at,
        message: approve
          ? `Approved role change for ${updatedUser.name} (${updatedUser.email}) -> ${updatedUser.role}.`
          : `Declined role change request for ${updatedUser.name} (${updatedUser.email}).`,
      });
    }

    // 1b. Super Admin Role Promotion / Demotion (reflects immediately)
    if (action === 'update_role') {
      if (!new_role || !['SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'CREATOR'].includes(new_role)) {
        return NextResponse.json(
          { error: 'Valid new_role (SUPER_ADMIN | ADMIN | REVIEWER | CREATOR) is required.' },
          { status: 400 }
        );
      }

      const updatedUser = securityDB.updateUserRole({
        actorId: effectiveActorId,
        actorRole: callerSecurityRole,
        targetIdentifier: target_user_id,
        newRole: new_role as DBRole,
      });

      // Keep accessGrants in sync
      updateAccessGrant({
        manager_id: effectiveActorId,
        manager_role: 'admin',
        target_user_id: updatedUser.id,
        action: 'approve',
      });

      await securityDB.saveToCloud();

      return NextResponse.json({
        success: true,
        user: updatedUser,
        version: updatedUser.version || 1,
        updated_at: updatedUser.updated_at,
        message: `${updatedUser.name} (@${updatedUser.username}) role updated to ${updatedUser.role}.`,
      });
    }

    // 2. Grant or Revoke Employee / Creator Lobby Rights (Allowed for both Admin and Manager)
    if (action === 'grant_lobby' || action === 'revoke_lobby') {
      const allowLobby = action === 'grant_lobby';
      const updatedGrant = updateAccessGrant({
        manager_id: effectiveActorId,
        manager_role: callerRole,
        target_user_id,
        action,
        department,
      });

      const dbUser = securityDB.findUserByIdOrIdentifier(target_user_id);
      if (dbUser) {
        securityDB.updateUserLobbyAccess({
          actorId: effectiveActorId,
          actorRole: callerSecurityRole,
          targetIdentifier: dbUser.id,
          lobbyAccess: allowLobby,
        });
      }

      await securityDB.saveToCloud();

      return NextResponse.json({
        success: true,
        grant: updatedGrant,
        user: dbUser,
        version: dbUser?.version || 1,
        updated_at: dbUser?.updated_at,
        lobby_access: allowLobby,
        message: allowLobby
          ? `Lobby rights granted to ${dbUser?.name || target_user_id}.`
          : `Lobby rights revoked for ${dbUser?.name || target_user_id}.`,
      });
    }

    // 3. Standard Database Access Approve / Revoke
    const updated = updateAccessGrant({
      manager_id: effectiveActorId,
      manager_role: callerRole,
      target_user_id,
      action,
      department,
    });

    await securityDB.saveToCloud();

    return NextResponse.json({ success: true, grant: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Access operation failed' },
      { status: err.status || 403 }
    );
  }
}
