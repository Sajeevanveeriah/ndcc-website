import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';
import { AUTH_ROLES, type AuthRole } from '@/lib/auth/config';
import {
  canManageUsers,
  checkUserAdministrationChange,
  normaliseStoredPermissions,
  userAdministrationRemovesActiveAdmin,
} from '@/lib/auth/permissions';
import { readLimitedJsonObject } from '@/lib/order-input-validation';

export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireUserAdministrator() {
  const user = await requireSession();
  return user && canManageUsers(user.role) ? user : null;
}

function isMissingAccessRpc(error: { code?: string; message?: string }) {
  const message = error.message || '';
  return error.code === 'PGRST202' || error.code === '42883' || message.includes('Could not find the function') || message.includes('does not exist');
}

async function readUserAdministrationBody(request: Request) {
  const parsed = await readLimitedJsonObject(request, 16 * 1024);
  if (parsed.ok) return { ok: true as const, value: parsed.value };
  return {
    ok: false as const,
    response: NextResponse.json(
      { success: false, error: parsed.error },
      { status: parsed.error === 'Request body is too large.' ? 413 : 400 },
    ),
  };
}

async function countActiveAdmins(supabase: ReturnType<typeof createServerClient>) {
  const { count, error } = await supabase
    .from('committee_users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true);
  return error ? null : count ?? 0;
}

function isDuplicateEmail(error: { code?: string; message?: string }) {
  const message = error.message || '';
  return error.code === '23505' || message.includes('committee_users_email_key') || message.includes('duplicate key');
}

export async function GET() {
  const administrator = await requireUserAdministrator();
  if (!administrator) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('committee_users')
    .select('id, email, full_name, role, is_active, cms_permissions, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: 'Failed to load users.' }, { status: 500 });
  return NextResponse.json({ success: true, users: data });
}

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ success: false, error: 'Missing Supabase service role key. Set SUPABASE_SERVICE_ROLE_KEY on the server before creating CMS users.' }, { status: 500 });
  }

  const administrator = await requireUserAdministrator();
  if (!administrator) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const parsedBody = await readUserAdministrationBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const { email, fullName, role, password, permissions } = parsedBody.value;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedFullName = String(fullName || '').trim();
  const normalizedRole = String(role || '') as AuthRole;
  const normalizedPassword = String(password || '');

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (!normalizedFullName) {
    return NextResponse.json({ success: false, error: 'Full name is required.' }, { status: 400 });
  }
  if (!AUTH_ROLES.includes(normalizedRole)) {
    return NextResponse.json({ success: false, error: 'Invalid role.' }, { status: 400 });
  }
  const createDecision = checkUserAdministrationChange({
    actor: administrator,
    target: null,
    nextRole: normalizedRole,
    nextActive: true,
  });
  if (!createDecision.ok) {
    return NextResponse.json({ success: false, error: createDecision.error }, { status: createDecision.status });
  }
  if ((normalizedRole === 'committee' || normalizedRole === 'fantasy_support') && permissions === undefined) {
    return NextResponse.json({ success: false, error: 'Explicit permissions are required for this role.' }, { status: 400 });
  }

  let normalizedPermissions;
  try {
    normalizedPermissions = normaliseStoredPermissions(normalizedRole, permissions ?? []);
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Invalid permissions.' }, { status: 400 });
  }

  if (normalizedPassword.length < 10) {
    return NextResponse.json({ success: false, error: 'Password must be at least 10 characters.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.rpc('ndcc_admin_create_committee_user_with_access', {
    p_email: normalizedEmail,
    p_full_name: normalizedFullName,
    p_role: normalizedRole,
    p_password: normalizedPassword,
    p_permissions: normalizedPermissions,
    p_created_by: administrator.id,
  });

  if (error) {
    if (isDuplicateEmail(error)) {
      return NextResponse.json({ success: false, error: 'A CMS user with that email already exists.' }, { status: 409 });
    }
    if (isMissingAccessRpc(error)) {
      return NextResponse.json({ success: false, error: 'The granular CMS access migration has not been applied.' }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: 'Failed to create CMS user.' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const administrator = await requireUserAdministrator();
  if (!administrator) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const parsedBody = await readUserAdministrationBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value;
  const { userId, resetPassword } = body;
  if (!userId || typeof userId !== 'string') return NextResponse.json({ success: false, error: 'userId is required.' }, { status: 400 });

  const supabase = createServerClient();
  const accessChangeRequested = ['email', 'fullName', 'role', 'permissions', 'isActive'].some((field) => body[field] !== undefined);
  const passwordResetRequested = resetPassword !== undefined && resetPassword !== null && resetPassword !== '';

  if (!accessChangeRequested && !passwordResetRequested) {
    return NextResponse.json({ success: false, error: 'No user changes provided.' }, { status: 400 });
  }

  // Load the target for every change (including password resets) so the
  // admin-account, self-change and last-admin rules apply uniformly.
  const { data: current, error: currentError } = await supabase
    .from('committee_users')
    .select('id, email, full_name, role, is_active, cms_permissions')
    .eq('id', userId)
    .maybeSingle();

  if (currentError) return NextResponse.json({ success: false, error: 'Failed to load CMS user.' }, { status: 500 });
  if (!current) return NextResponse.json({ success: false, error: 'CMS user not found.' }, { status: 404 });

  if (!accessChangeRequested) {
    const resetDecision = checkUserAdministrationChange({
      actor: administrator,
      target: current,
      nextRole: current.role,
      nextActive: Boolean(current.is_active),
    });
    if (!resetDecision.ok) {
      return NextResponse.json({ success: false, error: resetDecision.error }, { status: resetDecision.status });
    }
  }

  if (accessChangeRequested) {
    const nextEmail = body.email === undefined ? current.email : String(body.email).trim().toLowerCase();
    const nextFullName = body.fullName === undefined ? current.full_name : String(body.fullName).trim();
    const nextRole = (body.role === undefined ? current.role : String(body.role)) as AuthRole;
    const nextActive = body.isActive === undefined ? Boolean(current.is_active) : body.isActive;

    if (!EMAIL_PATTERN.test(nextEmail)) {
      return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (!nextFullName) {
      return NextResponse.json({ success: false, error: 'Full name is required.' }, { status: 400 });
    }
    if (!AUTH_ROLES.includes(nextRole)) {
      return NextResponse.json({ success: false, error: 'Invalid role.' }, { status: 400 });
    }
    if (typeof nextActive !== 'boolean') {
      return NextResponse.json({ success: false, error: 'isActive must be a boolean.' }, { status: 400 });
    }

    const currentAccount = { id: current.id, role: current.role as AuthRole, is_active: Boolean(current.is_active) };
    let activeAdminCount: number | undefined;
    if (userAdministrationRemovesActiveAdmin(currentAccount, nextRole, nextActive)) {
      const counted = await countActiveAdmins(supabase);
      if (counted === null) return NextResponse.json({ success: false, error: 'Failed to load CMS user.' }, { status: 500 });
      activeAdminCount = counted;
    }
    const accessDecision = checkUserAdministrationChange({
      actor: administrator,
      target: currentAccount,
      nextRole,
      nextActive,
      activeAdminCount,
    });
    if (!accessDecision.ok) {
      return NextResponse.json({ success: false, error: accessDecision.error }, { status: accessDecision.status });
    }

    const enteringGranularRole = body.role !== undefined
      && (nextRole === 'committee' || nextRole === 'fantasy_support')
      && current.role !== nextRole;
    if (enteringGranularRole && body.permissions === undefined) {
      return NextResponse.json({ success: false, error: 'Explicit permissions are required when changing to this role.' }, { status: 400 });
    }

    const permissionsInput = body.permissions === undefined ? current.cms_permissions || [] : body.permissions;
    let normalizedPermissions;
    try {
      normalizedPermissions = normaliseStoredPermissions(nextRole, permissionsInput);
    } catch (error) {
      return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Invalid permissions.' }, { status: 400 });
    }

    const { error } = await supabase.rpc('ndcc_admin_update_committee_user_access', {
      p_user_id: userId,
      p_email: nextEmail,
      p_full_name: nextFullName,
      p_role: nextRole,
      p_is_active: nextActive,
      p_permissions: normalizedPermissions,
      p_updated_by: administrator.id,
    });

    if (error) {
      if (isDuplicateEmail(error)) {
        return NextResponse.json({ success: false, error: 'A CMS user with that email already exists.' }, { status: 409 });
      }
      // Database backstop (committee_users_last_admin_guard) for concurrent changes.
      if (/At least one active administrator must remain/.test(error.message || '')) {
        return NextResponse.json({ success: false, error: 'At least one active administrator must remain.' }, { status: 409 });
      }
      if (isMissingAccessRpc(error)) {
        return NextResponse.json({ success: false, error: 'The granular CMS access migration has not been applied.' }, { status: 503 });
      }
      return NextResponse.json({ success: false, error: 'Failed to update CMS user access.' }, { status: 400 });
    }
  }

  if (passwordResetRequested) {
    const normalizedResetPassword = String(resetPassword);
    if (normalizedResetPassword.length < 10) {
      return NextResponse.json({ success: false, error: 'Reset password must be 10+ characters.' }, { status: 400 });
    }

    const { error } = await supabase.rpc('ndcc_set_committee_password', {
      p_user_id: userId,
      p_password: normalizedResetPassword,
    });
    if (error) return NextResponse.json({ success: false, error: 'Failed to reset password.' }, { status: 500 });
    await supabase.from('committee_sessions').delete().eq('user_id', userId);
  }

  return NextResponse.json({ success: true });
}
