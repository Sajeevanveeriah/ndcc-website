import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, AuthRole } from './config';
import { getSessionUserFromToken } from './session';

export async function requireSession(allowedRoles?: AuthRole[]) {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  const user = await getSessionUserFromToken(token);
  if (!user) return null;
  if (allowedRoles && !allowedRoles.includes(user.role)) return null;
  return user;
}
