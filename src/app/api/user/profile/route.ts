import { NextRequest, NextResponse } from 'next/server';
import { securityDB } from '@/backend/database.ts';
import { backendReviewStore } from '@/backend/reviewStore.ts';
import {
  deleteLobbiesForUser,
  listLobbiesForUser,
  syncLobbiesFromCloud,
  saveLobbiesToCloud,
} from '@/backend/lobby.ts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await Promise.all([securityDB.syncFromCloud(), syncLobbiesFromCloud()]);
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || searchParams.get('user_id') || '';
    const email = searchParams.get('email') || '';

    if (!userId && !email) {
      return NextResponse.json({ error: 'User identifier or email required' }, { status: 400 });
    }

    const user =
      (userId ? securityDB.findUserByIdOrIdentifier(userId) : undefined) ||
      (email ? securityDB.findUserByEmail(email) : undefined);

    const userEmail = (email || user?.email || '').trim().toLowerCase();
    const cleanId = (userId || user?.id || '').trim().toLowerCase();

    // Fetch user reviews
    const allReviews = backendReviewStore.list();
    const userReviews = allReviews.filter((r) => {
      const by = (r.submittedBy || '').toLowerCase();
      const roleText = (r.submittedRole || '').toLowerCase();
      return (
        (cleanId && by === cleanId) ||
        (userEmail && (by === userEmail || roleText.includes(userEmail)))
      );
    });

    // Fetch user lobbies
    const userLobbies = listLobbiesForUser({
      user_id: user?.id || userId,
      email: userEmail,
      security_role: user?.role || 'CREATOR',
    });

    return NextResponse.json({
      user: user
        ? {
            id: user.id,
            username: user.username,
            email: user.email,
            name: user.name,
            role: user.role,
            department: user.department,
            brand_id: user.brand_id,
            brand_name: user.brand_name || 'Default Workspace',
            is_approved: user.is_approved,
            lobby_access: user.lobby_access,
            created_at: user.created_at,
            updated_at: user.updated_at || user.created_at,
            version: user.version || 1,
            requested_role: user.requested_role || null,
            role_request_status: user.role_request_status || null,
            role_request_note: user.role_request_note || null,
            role_request_at: user.role_request_at || null,
          }
        : null,
      reviews: userReviews.map((r) => ({
        id: r.id,
        title: r.title,
        brand: (r as any).brand || r.channel || 'EcoFresh Botanicals',
        status: r.status,
        score: r.score,
        submittedAt: r.submittedAt,
        updatedAt: r.updatedAt,
        openFindings: (r.findings || []).filter((f) => f.status === 'open').length,
      })),
      lobbies: userLobbies.map((l) => ({
        lobby_code: l.lobby_code,
        room_code: l.room_code,
        title: l.title,
        created_at: l.created_at,
        updated_at: l.updated_at || l.created_at,
        version: l.version || 1,
        created_by: l.created_by,
        created_by_email: l.created_by_email,
        status: l.status,
        permission_granted: l.permission_granted,
        participantsCount: (l.participants || []).length,
        isCreator:
          (user?.id && l.created_by === user.id) ||
          (userEmail && (l.created_by_email || '').toLowerCase() === userEmail),
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load user projects' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await securityDB.syncFromCloud(true);
    const body = await req.json();
    const { userId, email, name, department, brand_name } = body;

    const identifier = userId || email;
    if (!identifier) {
      return NextResponse.json(
        { error: 'userId or email is required to update profile' },
        { status: 400 }
      );
    }

    const updated = securityDB.updateUserProfile({
      userIdOrEmail: identifier,
      name,
      department,
      brand_name,
    });

    await securityDB.saveToCloud();

    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        department: updated.department,
        brand_id: updated.brand_id,
        brand_name: updated.brand_name || 'Default Workspace',
        is_approved: updated.is_approved,
        lobby_access: updated.lobby_access,
        version: updated.version || 1,
        updated_at: updated.updated_at,
        requested_role: updated.requested_role || null,
        role_request_status: updated.role_request_status || null,
      },
      message: 'Profile updated successfully',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to update profile' },
      { status: err.status || 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await Promise.all([securityDB.syncFromCloud(true), syncLobbiesFromCloud(true)]);
    const body = await req.json();
    const { action, userId, email, scope } = body;

    const identifier = userId || email;
    if (!identifier) {
      return NextResponse.json({ error: 'User identifier required' }, { status: 400 });
    }

    if (action === 'delete_history') {
      let deletedReviews = 0;
      let deletedLobbies = 0;

      if (scope === 'reviews' || scope === 'all') {
        deletedReviews = backendReviewStore.deleteReviewsForUser(userId, email);
      }
      if (scope === 'lobbies' || scope === 'all') {
        deletedLobbies = deleteLobbiesForUser(userId, email);
      }

      securityDB.logAudit({
        brand_id: 'b0000001-0000-4000-8000-000000000001',
        user_id: userId || null,
        user_email: email || 'user',
        action: 'HISTORY_CLEARED',
        details: {
          scope: scope || 'all',
          deleted_reviews: deletedReviews,
          deleted_lobbies: deletedLobbies,
        },
      });

      await Promise.all([securityDB.saveToCloud(), saveLobbiesToCloud()]);

      return NextResponse.json({
        success: true,
        scope,
        deleted: {
          reviews: deletedReviews,
          lobbies: deletedLobbies,
        },
        message: `Cleared ${deletedReviews} reviews and ${deletedLobbies} lobby rooms.`,
      });
    }

    if (action === 'delete_account') {
      // Cascading deletion: reviews, lobbies, then user account
      const deletedReviews = backendReviewStore.deleteReviewsForUser(userId, email);
      const deletedLobbies = deleteLobbiesForUser(userId, email);
      const userDeleted = securityDB.deleteUserAccount(identifier);

      await Promise.all([securityDB.saveToCloud(), saveLobbiesToCloud()]);

      if (!userDeleted) {
        return NextResponse.json(
          { error: 'User account could not be found or cannot be deleted' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        cascade: {
          reviews_removed: deletedReviews,
          lobbies_removed: deletedLobbies,
          account_deleted: true,
        },
        message: 'Account, personal rooms, and reviews permanently deleted.',
      });
    }

    return NextResponse.json({ error: 'Invalid action specified' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Operation failed' },
      { status: err.status || 500 }
    );
  }
}
