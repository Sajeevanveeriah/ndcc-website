import { createClient, type User } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';

type ManagerAuthResult = {
  user: User;
  manager: FantasyManagerRecord;
};

export type FantasyManagerRecord = {
  id: string;
  auth_user_id: string | null;
  display_name: string;
  email: string;
  team_name: string;
  is_active: boolean;
};

export function createAnonAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
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
