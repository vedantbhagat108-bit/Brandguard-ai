import { NextRequest, NextResponse } from 'next/server';
import { securityDB } from '@/backend/database.ts';
import { pinIpLimiter, RateLimitError } from '@/backend/rateLimiter.ts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  securityDB.loadFromDisk();
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brand_id');

  // Deduplicate workspaces by id
  const uniqueWorkspacesMap = new Map<string, { id: string; name: string; brand_name: string; created_at: string }>();
  for (const ws of securityDB.workspaces.values()) {
    if (!uniqueWorkspacesMap.has(ws.id)) {
      uniqueWorkspacesMap.set(ws.id, {
        id: ws.id,
        name: ws.name,
        brand_name: ws.name,
        created_at: ws.created_at,
      });
    }
  }
  const workspaces = Array.from(uniqueWorkspacesMap.values());

  let pins = Array.from(securityDB.pins.values()).map((p) => ({
    ...p,
    brand_name: p.brand_name || securityDB.workspaces.get(p.brand_id)?.name || 'Default Workspace',
  }));

  let auditLogs = securityDB.auditLogs.map((log) => ({
    id: log.id,
    brand_id: log.brand_id,
    user_id: log.user_id || 'system',
    user_email: log.user_email || 'system@brandlens.ai',
    action: log.action,
    details: log.details_text || JSON.stringify(log.details),
    details_obj: log.details,
    ip_address: log.ip_address || '127.0.0.1',
    timestamp: log.timestamp,
  }));

  const users = Array.from(securityDB.users.values()).map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    role: u.role,
    brand_id: u.brand_id,
    brand_name: u.brand_name || securityDB.workspaces.get(u.brand_id)?.name || 'Default Workspace',
    department: u.department,
    is_approved: u.is_approved,
    lobby_access: typeof u.lobby_access === 'boolean' ? u.lobby_access : true,
    created_at: u.created_at,
    password_updated_at: u.password_updated_at || null,
    requested_role: u.requested_role || null,
    role_request_status: u.role_request_status || null,
    role_request_note: u.role_request_note || null,
    role_request_at: u.role_request_at || null,
  }));

  if (brandId) {
    pins = pins.filter((p) => p.brand_id === brandId);
    auditLogs = auditLogs.filter((a) => a.brand_id === brandId);
  }

  return NextResponse.json({
    workspaces,
    pins,
    users,
    audit_logs: auditLogs,
  });
}

export async function POST(req: NextRequest) {
  try {
    pinIpLimiter.checkRateLimit(req);

    const body = await req.json();
    const { pin_code, brand_id, email, user_email } = body;
    const targetEmail = email || user_email || 'user@workspace.local';

    if (!pin_code) {
      return NextResponse.json({ detail: 'pin_code is required.' }, { status: 400 });
    }

    const burned = securityDB.verifyAndBurnPin({
      pin_code,
      brand_id,
      user_email: targetEmail,
    });

    return NextResponse.json({
      success: true,
      pin: burned,
      message: `BrandPIN ${burned.pin_code} verified and burned for ${targetEmail}.`,
    });
  } catch (err: any) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { detail: err.message },
        { status: 429, headers: err.headers }
      );
    }
    return NextResponse.json(
      { detail: err.message || 'PIN verification failed' },
      { status: err.status || 403 }
    );
  }
}
