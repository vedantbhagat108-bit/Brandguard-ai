import { NextRequest, NextResponse } from 'next/server';
import {
  listLobbies,
  getLobby,
  createLobby,
  joinLobby,
  updateLobbyState,
} from '@/backend/lobby.ts';
import { securityDB } from '@/backend/database.ts';
import { UserRole } from '@/backend/types.ts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code') || searchParams.get('room_code');

  if (code) {
    const lobby = getLobby(code);
    if (!lobby) {
      return NextResponse.json({ detail: `Lobby "${code}" not found.` }, { status: 404 });
    }
    return NextResponse.json(lobby);
  }

  return NextResponse.json(listLobbies());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action = 'create',
      lobby_code,
      room_code,
      title,
      initial_content,
      content_draft,
      brand_guidelines,
      package_id,
      user_id,
      creator_id,
      name,
      creator_name,
      author_name,
      manager_name,
      email = 'user@ecofresh.com',
      role,
      creator_role,
      author_role,
      user_role,
      content,
      note,
      text,
      score,
    } = body;

    const targetCode = (room_code || lobby_code || '').trim();
    const rawRole = role || creator_role || author_role || user_role || 'content_creator';
    const actorId = user_id || creator_id || 'user-1';
    const actorName = name || creator_name || author_name || manager_name || email;

    const normalizedRole: UserRole =
      rawRole === 'ADMIN' || rawRole === 'manager' || rawRole === 'admin'
        ? 'manager'
        : rawRole === 'REVIEWER' || rawRole === 'authorised_reviewer'
        ? 'authorised_reviewer'
        : 'content_creator';

    const dbUser =
      securityDB.findUserByIdOrIdentifier(actorId) ||
      securityDB.findUserByIdOrIdentifier(email);

    if (
      normalizedRole === 'content_creator' &&
      dbUser &&
      dbUser.lobby_access === false
    ) {
      return NextResponse.json(
        {
          error:
            'Lobby access has been revoked by your Manager or Admin. Please ask your Manager to grant Lobby Rights.',
          detail:
            'Lobby access has been revoked by your Manager or Admin.',
        },
        { status: 403 }
      );
    }

    if (action === 'create') {
      const lobby = createLobby({
        manager_id: actorId,
        manager_name: actorName,
        manager_email: email,
        title: title || 'Collaborative Governance Session',
        initial_content: content_draft ?? initial_content,
        brand_guidelines,
        package_id,
      });

      securityDB.logAudit({
        brand_id: 'b0000001-0000-4000-8000-000000000001',
        user_id: actorId,
        user_email: email,
        action: 'LOBBY_CREATED',
        details: {
          room_code: lobby.room_code,
          title: lobby.title,
          created_by: actorName,
        },
      });

      return NextResponse.json(lobby, { status: 201 });
    }

    if (action === 'join') {
      if (!targetCode) {
        return NextResponse.json(
          { error: 'Room PIN / code is required to join.', detail: 'room_code is required.' },
          { status: 400 }
        );
      }

      let codeToJoin = targetCode;
      const existingLobby = getLobby(targetCode) || getLobby(targetCode.toUpperCase());
      if (!existingLobby) {
        const matchedPin = securityDB.pins.get(targetCode.toUpperCase());
        if (matchedPin && !matchedPin.is_used) {
          const allLobbies = listLobbies();
          if (allLobbies.length > 0) {
            codeToJoin = allLobbies[0].room_code;
          }
        }
      } else {
        codeToJoin = existingLobby.room_code;
      }

      const lobby = joinLobby({
        lobby_code: codeToJoin,
        user_id: actorId,
        name: actorName,
        email,
        role: normalizedRole,
      });

      securityDB.logAudit({
        brand_id: 'b0000001-0000-4000-8000-000000000001',
        user_id: actorId,
        user_email: email,
        action: 'LOBBY_JOINED',
        details: { room_code: codeToJoin, participant: actorName, role: normalizedRole },
      });

      return NextResponse.json(lobby);
    }

    if (['update_content', 'add_note', 'manager_approve', 'close'].includes(action)) {
      if (!targetCode) {
        return NextResponse.json(
          { error: 'room_code is required.', detail: 'room_code is required.' },
          { status: 400 }
        );
      }
      const updated = updateLobbyState({
        lobby_code: targetCode,
        user_id: actorId,
        author_name: actorName,
        role: normalizedRole,
        action: action as 'update_content' | 'add_note' | 'manager_approve' | 'close',
        content: content_draft ?? content,
        brand_guidelines,
        score,
        note: text ?? note,
        package_id,
      });

      if (action === 'manager_approve') {
        securityDB.logAudit({
          brand_id: 'b0000001-0000-4000-8000-000000000001',
          user_id: actorId,
          user_email: email,
          action: 'LOBBY_APPROVED',
          details: { room_code: targetCode, approved_by: actorName },
        });
      }

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: `Unsupported lobby action "${action}"` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Lobby operation failed', detail: err.message },
      { status: 400 }
    );
  }
}
