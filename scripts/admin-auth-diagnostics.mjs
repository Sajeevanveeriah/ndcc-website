#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
const email = (process.argv[2] || 'sajeevanveeriah@gmail.com').trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Supabase server client configured: false'); process.exit(1); }
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const out = { configured: true, email };
const user = await supabase.from('committee_users').select('id,email,is_active,role').eq('email', email).maybeSingle();
out.committee_users_reachable = !user.error;
out.user_exists = Boolean(user.data);
out.is_active = user.data?.is_active ?? null;
out.role = user.data?.role ?? null;
const fn = await supabase.rpc('ndcc_verify_committee_user', { p_email: email, p_password: '__diagnostic_invalid_password__' });
out.verify_function_exists = !fn.error || fn.error.code !== '42883';
const sessions = await supabase.from('committee_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.data?.id || '00000000-0000-0000-0000-000000000000');
out.sessions_table_reachable = !sessions.error;
out.multi_device_schema = 'committee_sessions.user_id is indexed but not unique in supabase/migrations/20260401_custom_committee_auth.sql';
console.log(JSON.stringify(out, null, 2));
