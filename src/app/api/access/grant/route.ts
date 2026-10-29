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
    const { target_user_id, action, new_role, department } = body;

    if (!target_user_id || !action) {
      return NextResponse.json(
        { error: 'target_user_id and action are required' },
        { status: 400 }
      );
    }

    // 1. Admin Role Promotion / Demotion (Admin can make other users Admin, Manager/Reviewer, or Creator)
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
