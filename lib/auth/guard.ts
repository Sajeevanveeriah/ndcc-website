import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, type AuthRole } from './config';
import { getSessionUserFromToken } from './session';
import { hasPermission, isFullAccessRole, type PermissionKey } from './permissions';

export async function requireSession(allowedRoles?: readonly AuthRole[]) {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
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
