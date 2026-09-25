import { NextResponse } from 'next/server';
import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { INTERESTS, VOLUNTEERING } from '@/lib/club-account/preferences';
import { toCsv } from '@/lib/csv';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers });
export async function GET(request: Request) {
  const auth = await requirePermissionResult('memberships');
  if (!auth.user) return reply({ success: false, error: auth.error }, auth.status);
  try {
    const params = new URL(request.url).searchParams;
    const interest = params.get('interest') || ''; const volunteer = params.get('volunteer') || '';
    const page = Number(params.get('page') || 0); const exporting = params.get('export') === 'csv';
    if ((interest && !Object.hasOwn(INTERESTS, interest)) || (volunteer && !Object.hasOwn(VOLUNTEERING, volunteer)) || !Number.isSafeInteger(page) || page < 0 || page > 1000) return reply({ success: false, error: 'Choose valid contact filters.' }, 400);
    const query = (from: number, to: number) => {
      let q = createServerClient().from('club_account_preferences')
        .select('member_id,interests,volunteering,email_updates,updated_at,member:club_members!inner(full_name,email,phone,membership_status,auth_user_id)', { count: 'exact' })
        .not('member.auth_user_id', 'is', null);
      if (interest) q = q.contains('interests', [interest]);
      if (volunteer) q = q.contains('volunteering', [volunteer]);
      if (exporting || params.get('opted_in') === 'true') q = q.eq('email_updates', true).neq('member.membership_status', 'inactive');
      return q.order('member_id').range(from, to);
    };
    const first = await query(exporting ? 0 : page * 100, exporting ? 999 : page * 100 + 99);
    if (first.error) throw first.error;
    const all = first.data || [];
    if (exporting) {
      // Never silently truncate a mailing list at the API row limit.
      if ((first.count || 0) > 10000) return reply({ success: false, error: 'Choose more specific filters before exporting more than 10,000 contacts.' }, 413);
      for (let offset = 1000; offset < (first.count || 0); offset += 1000) {
        const next = await query(offset, offset + 999);
        if (next.error) throw next.error;
        all.push(...(next.data || []));
      }
    }
    const contacts = all.map(row => {
      const member = Array.isArray(row.member) ? row.member[0] : row.member;
      return { full_name: member.full_name, email: member.email, phone: member.phone, status: member.membership_status,
        interests: row.interests as string[], volunteering: row.volunteering as string[], email_updates: row.email_updates,
        updated_at: row.updated_at, member_id: row.member_id };
    });
    if (exporting) {
      const csv = toCsv([['Name', 'Email', 'Phone', 'Interests', 'Volunteering', 'Email consent', 'Preference updated'], ...contacts.map(row => [row.full_name, row.email, row.phone,
        row.interests.map(key => INTERESTS[key as keyof typeof INTERESTS]).join('; '), row.volunteering.map(key => VOLUNTEERING[key as keyof typeof VOLUNTEERING]).join('; '), 'Yes', row.updated_at])]);
      return new Response(csv, { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="NDCC-Opted-In-Contacts.csv"' } });
    }
    return reply({ success: true, contacts, total: first.count || 0 });
  } catch { return reply({ success: false, error: 'Member preferences could not be loaded. Please retry.' }, 503); }
}
