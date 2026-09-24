import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, type AuthRole } from './config';
import { getSessionUserFromToken, resolveSessionFromToken, type CommitteeSessionUser } from './session';
import { hasPermission, isFullAccessRole, type PermissionKey } from './permissions';

type PermissionResult =
  | { user: CommitteeSessionUser; status: 200; error?: never }
  | { user: null; status: 401 | 403 | 503; error: string };

/** Keep an unavailable identity service distinct from an access denial. */
export async function requirePermissionResult(permission: PermissionKey): Promise<PermissionResult> {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const session = await resolveSessionFromToken(token);
  if (session.status === 'unavailable') {
    return { user: null, status: 503, error: 'Session validation is temporarily unavailable. Please retry.' };
  }
  if (session.status === 'unauthenticated') {
    return { user: null, status: 401, error: 'Your session has expired. Please sign in again.' };
  }
  if (!hasPermission(session.user, permission)) {
    return { user: null, status: 403, error: 'Your account does not have access to this section.' };
  }
  return { user: session.user, status: 200 };
}

export async function requireSession(allowedRoles?: readonly AuthRole[]) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const user = await getSessionUserFromToken(token);
  if (!user) return null;
  if (allowedRoles && !allowedRoles.includes(user.role)) return null;
  return user;
}

export async function requirePermission(permission: PermissionKey, allowedRoles?: readonly AuthRole[]) {
  const user = await requireSession();
  if (!user || !hasPermission(user, permission)) return null;
  if (isFullAccessRole(user.role)) return user;
  if (allowedRoles && !allowedRoles.includes(user.role)) return null;
  return user;
}

export async function requireAnyPermission(permissions: readonly PermissionKey[], allowedRoles?: readonly AuthRole[]) {
  const user = await requireSession();
  if (!user || !permissions.some((permission) => hasPermission(user, permission))) return null;
  if (isFullAccessRole(user.role)) return user;
  if (allowedRoles && !allowedRoles.includes(user.role)) return null;
  return user;
}
