import { NextRequest, NextResponse } from 'next/server';
import {
  listLobbiesForUser,
  getLobby,
  createLobby,
  joinLobby,
  updateLobbyState,
  discardLobby,
  setLobbyPermission,
  isSuperAdminUser,
  regenerateAdminOtp,
  requestLobbyJoinCode,
  resolveLobbyJoinRequest,
  requestOtp,
  sanitizeLobbyForClient,
} from '@/backend/lobby.ts';
import { securityDB } from '@/backend/database.ts';
import { UserRole } from '@/backend/types.ts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code') || searchParams.get('room_code');
  const userId = searchParams.get('user_id');
  const email = searchParams.get('email');
  const securityRole = searchParams.get('security_role');
  const role = searchParams.get('role');

  if (code) {
    const lobby = getLobby(code);
    if (!lobby) {
      return NextResponse.json({ detail: `Lobby "${code}" not found.` }, { status: 404 });
    }
    return NextResponse.json(sanitizeLobbyForClient(lobby));
  }

  return NextResponse.json(
    listLobbiesForUser({
      user_id: userId,
      email,
      security_role: securityRole,
      role,
    })
  );
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
      email = '',
      recipient_email,
      role,
      security_role,
      creator_role,
      author_role,
      user_role,
      content,
      note,
      text,
      score,
      permission_granted,
      request_id,
      approve,
      google_access_token,
    } = body;

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : null;
    const effectiveGoogleToken = (google_access_token || bearerToken || '').trim() || null;

    const targetCode = (room_code || lobby_code || '').trim();
    const rawRole = role || creator_role || author_role || user_role || 'content_creator';
    const actorId = user_id || creator_id || '';
    const actorName = name || creator_name || author_name || manager_name || email;

    const normalizedRole: UserRole =
      rawRole === 'SUPER_ADMIN' || rawRole === 'ADMIN' || rawRole === 'manager' || rawRole === 'admin'
        ? 'manager'
        : rawRole === 'REVIEWER' || rawRole === 'authorised_reviewer'
        ? 'authorised_reviewer'
        : 'content_creator';

    securityDB.loadFromDisk();
    const dbUser =
      securityDB.findUserByIdOrIdentifier(actorId) ||
      securityDB.findUserByIdOrIdentifier(email);

    const effectiveSecurityRole =
      security_role || dbUser?.role || (rawRole === 'ADMIN' ? 'ADMIN' : undefined);

    // Super Admin actions: discard_lobby & set_lobby_permission
    if (action === 'discard_lobby') {
      if (!isSuperAdminUser(actorId, email, effectiveSecurityRole)) {
        return NextResponse.json(
          { error: 'Only Super Admin can discard lobbies.' },
          { status: 403 }
        );
      }
      if (!targetCode) {
        return NextResponse.json(
          { error: 'room_code is required to discard a lobby.' },
          { status: 400 }
        );
      }
      const discarded = discardLobby(targetCode);
      securityDB.logAudit({
        brand_id: 'b0000001-0000-4000-8000-000000000001',
        user_id: actorId,
        user_email: email,
        action: 'STATUS_UPDATED',
        details: {
          summary: `Super Admin discarded lobby #${targetCode} (${discarded.title})`,
          room_code: targetCode,
        },
      });
      return NextResponse.json({
        ok: true,
        message: `Discarded lobby "${discarded.title}".`,
      });
    }

    if (action === 'set_lobby_permission') {
      if (!isSuperAdminUser(actorId, email, effectiveSecurityRole)) {
        return NextResponse.json(
          { error: 'Only Super Admin can grant or suspend lobby permissions.' },
          { status: 403 }
        );
      }
      if (!targetCode) {
        return NextResponse.json(
          { error: 'room_code is required.' },
          { status: 400 }
        );
      }
      const granted = Boolean(permission_granted);
      const updated = setLobbyPermission(targetCode, granted);
      securityDB.logAudit({
        brand_id: 'b0000001-0000-4000-8000-000000000001',
        user_id: actorId,
        user_email: email,
        action: 'LOBBY_ACCESS_UPDATED',
        details: {
          summary: `Super Admin ${granted ? 'granted' : 'revoked'} permission for lobby #${targetCode} (${updated.title})`,
          room_code: targetCode,
          permission_granted: granted,
        },
      });
      return NextResponse.json(sanitizeLobbyForClient(updated));
    }

    // Check person-level lobby permission for non-Super-Admin users
    if (
      !isSuperAdminUser(actorId, email, effectiveSecurityRole) &&
      dbUser &&
      dbUser.lobby_access === false
    ) {
      return NextResponse.json(
        {
          error:
            'Your Lobby access permission has been revoked. Please ask the Super Admin to grant Lobby permission.',
          detail: 'Lobby access permission has been revoked.',
        },
        { status: 403 }
      );
    }

    // Admin requests or regenerates a 15-minute self-destructing OTP via mail (NEVER returned in plaintext to frontend)
    if (action === 'send_admin_otp') {
      const targetEmail = (recipient_email || email || '').trim();
      if (!targetEmail) {
        return NextResponse.json(
          { error: 'Recipient email is required to send the 15-minute OTP.' },
          { status: 400 }
        );
      }
      if (targetCode) {
        const regenRes = await regenerateAdminOtp({
          lobby_code: targetCode,
          user_id: actorId,
          email,
          recipient_email: targetEmail,
          google_access_token: effectiveGoogleToken,
          sender_name: actorName,
        });
        if (!regenRes.delivered) {
          return NextResponse.json(
            {
              ok: false,
              delivered: false,
              requires_google_auth: !effectiveGoogleToken,
              error:
                regenRes.deliveryError ||
                'Please sign in with Google so the 15-minute self-destructing OTP can be delivered to your email inbox.',
            },
            { status: 401 }
          );
        }
        return NextResponse.json({
          ok: true,
          delivered: true,
          delivery_mode: regenRes.deliveryMode,
          expires_at: regenRes.lobby.admin_otp_expires_at,
          recipient: targetEmail,
          lobby: sanitizeLobbyForClient(regenRes.lobby),
          message: `15-minute self-destructing OTP delivered to ${targetEmail}. Please check your email inbox.`,
        });
      } else {
        const otpRes = await requestOtp(targetEmail, 'manager', {
          googleAccessToken: effectiveGoogleToken,
          senderName: actorName,
          senderEmail: email,
        });
        if (!otpRes.delivered) {
          return NextResponse.json(
            {
              ok: false,
              delivered: false,
              requires_google_auth: !effectiveGoogleToken,
              error:
                otpRes.delivery_error ||
                'Please sign in with Google so the 15-minute self-destructing OTP can be delivered to your email inbox.',
            },
            { status: 401 }
          );
        }
        return NextResponse.json({
          ok: true,
          delivered: true,
          delivery_mode: otpRes.delivery_mode,
          expires_at: otpRes.expires_at,
          recipient: targetEmail,
          message: otpRes.message,
        });
      }
    }

    // Creator requests a different Lobby Joining Code from the Admin who created the lobby
    if (action === 'request_join') {
      if (!targetCode) {
        return NextResponse.json(
          { error: 'room_code is required to request lobby access.' },
          { status: 400 }
        );
      }
      const { lobby, request } = requestLobbyJoinCode({
        lobby_code: targetCode,
        user_id: actorId,
        name: actorName,
        email,
        role: normalizedRole,
        note: note || text,
      });

      securityDB.logAudit({
        brand_id: 'b0000001-0000-4000-8000-000000000001',
        user_id: actorId,
        user_email: email,
        action: 'LOBBY_ACCESS_UPDATED',
        details: {
          summary: `${actorName} (${email}) requested Lobby Joining Code for "${lobby.title}"`,
          room_code: targetCode,
        },
      });

      return NextResponse.json({
        ok: true,
        message: `Join request sent to Admin (${lobby.created_by}). Once the Admin accepts your request, you can enter directly or join via the Manager's Joining Code.`,
        request_status: request.status,
      });
    }

    // Admin who created the lobby accepts or declines a Creator's join request
    if (action === 'resolve_join_request') {
      if (!targetCode || !request_id) {
        return NextResponse.json(
          { error: 'room_code and request_id are required.' },
          { status: 400 }
        );
      }
      const { lobby, request } = resolveLobbyJoinRequest({
        lobby_code: targetCode,
        request_id: String(request_id),
        admin_user_id: actorId,
        admin_email: email,
        approve: Boolean(approve),
      });

      securityDB.logAudit({
        brand_id: 'b0000001-0000-4000-8000-000000000001',
        user_id: actorId,
        user_email: email,
        action: 'LOBBY_ACCESS_UPDATED',
        details: {
          summary: `Room Admin ${approve ? 'accepted' : 'declined'} join request from ${request.email} for "${lobby.title}"`,
          room_code: targetCode,
        },
      });

      return NextResponse.json({
        ok: true,
        lobby: sanitizeLobbyForClient(lobby),
        request,
        message: approve
          ? `Accepted ${request.name} (${request.email}). They can now enter the room directly or join using Joining Code #${request.requested_join_code || lobby.manager_join_code}.`
          : `Declined join request from ${request.name}.`,
      });
    }

    if (action === 'create') {
      const { lobby, emailDelivered, emailError } = await createLobby({
        manager_id: actorId,
        manager_name: actorName,
        manager_email: email,
        recipient_email: recipient_email || email,
        security_role: effectiveSecurityRole,
        title: title || 'Collaborative Governance Session',
        initial_content: content_draft ?? initial_content,
        brand_guidelines,
        package_id,
        google_access_token: effectiveGoogleToken,
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
          otp_email_delivered: emailDelivered,
        },
      });

      return NextResponse.json(
        {
          ...sanitizeLobbyForClient(lobby),
          email_delivered: emailDelivered,
          email_error: emailError,
        },
        { status: 201 }
      );
    }

    if (action === 'join') {
      if (!targetCode) {
        return NextResponse.json(
          { error: 'Lobby Joining Code is required to join.', detail: 'room_code is required.' },
          { status: 400 }
        );
      }

      const lobby = joinLobby({
        lobby_code: targetCode,
        user_id: actorId,
        name: actorName,
        email,
        role: normalizedRole,
        security_role: effectiveSecurityRole,
      });

      securityDB.logAudit({
        brand_id: 'b0000001-0000-4000-8000-000000000001',
        user_id: actorId,
        user_email: email,
        action: 'LOBBY_JOINED',
        details: { room_code: lobby.room_code, participant: actorName, role: normalizedRole },
      });

      return NextResponse.json(sanitizeLobbyForClient(lobby));
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
        user_email: email,
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

      return NextResponse.json(sanitizeLobbyForClient(updated));
    }

    return NextResponse.json({ error: `Unsupported lobby action "${action}"` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Lobby operation failed', detail: err.message },
      { status: 400 }
    );
  }
}
