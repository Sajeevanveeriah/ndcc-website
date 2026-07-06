import { createClient, type User } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';

export type ManagerAuthResult = {
  user: User;
  manager: FantasyManagerRecord;
};

export const FANTASY_SIGN_IN_REQUIRED_MESSAGE = 'Fantasy manager sign in is required.';
export const FANTASY_PROFILE_REQUIRED_MESSAGE = 'Create your fantasy manager profile to start playing.';

export type ManagerAuthResolution =
  | { auth: ManagerAuthResult; errorMessage: null; errorStatus: null }
  | { auth: null; errorMessage: string; errorStatus: 401 | 403 };

export type FantasyManagerRecord = {
  id: string;
  auth_user_id: string | null;
  display_name: string;
  email: string;
  team_name: string;
  is_active: boolean;
};

export function createAnonAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase public auth client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getBearerToken(request: Request) {
  const header = request.headers.get('authorization') || '';
  const [type, token] = header.split(' ');
  if (type?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export async function getAuthUserFromRequest(request: Request) {
  const token = getBearerToken(request);
  if (!token) return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const { data, error } = await createAnonAuthClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function requireFantasyManager(request: Request): Promise<ManagerAuthResult | null> {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email) return null;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_managers')
    .select('id, auth_user_id, display_name, email, team_name, is_active')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return { user, manager: data as FantasyManagerRecord };
}

/**
 * Like requireFantasyManager, but distinguishes "not signed in" (401) from
 * "signed in without an active fantasy manager profile" (403) so API routes
 * can return an actionable error message. requireFantasyManager keeps its
 * existing nullable return shape for all current consumers.
 */
export async function resolveFantasyManagerAuth(request: Request): Promise<ManagerAuthResolution> {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email) return { auth: null, errorMessage: FANTASY_SIGN_IN_REQUIRED_MESSAGE, errorStatus: 401 };

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_managers')
    .select('id, auth_user_id, display_name, email, team_name, is_active')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return { auth: null, errorMessage: FANTASY_PROFILE_REQUIRED_MESSAGE, errorStatus: 403 };
  return { auth: { user, manager: data as FantasyManagerRecord }, errorMessage: null, errorStatus: null };
}
