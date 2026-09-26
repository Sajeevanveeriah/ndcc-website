import { NextResponse } from 'next/server';
import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const fields = 'id,email,reason,status,created_at,actioned_at,member:club_members(full_name,membership_status)';
// Member-submitted account deletion requests. Marking one actioned records
// that the committee has handled it; this route never deletes any data.
export async function GET() {
  const auth = await requirePermissionResult('memberships');
  if (!auth.user) return reply({ success: false, error: auth.error }, auth.status);
  const { data, error } = await createServerClient().from('club_account_deletion_requests').select(fields)
    .order('status', { ascending: false }).order('created_at', { ascending: false }).limit(100);
  // Before the migration is applied the section reports it as unavailable.
  if (error) return reply({ success: true, requests: [], available: false });
  return reply({ success: true, requests: data || [], available: true });
}
export async function PATCH(request: Request) {
  const auth = await requirePermissionResult('memberships');
  if (!auth.user) return reply({ success: false, error: auth.error }, auth.status);
  const body = await readLimitedJsonObject(request);
  if (!body.ok || typeof body.value.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.value.id) || body.value.status !== 'actioned') return reply({ success: false, error: 'Choose a valid deletion request.' }, 400);
  const { data, error } = await createServerClient().from('club_account_deletion_requests')
    .update({ status: 'actioned', actioned_at: new Date().toISOString(), actioned_by: auth.user.id })
    .eq('id', body.value.id).eq('status', 'pending').select('id').maybeSingle();
  if (error) return reply({ success: false, error: 'The request could not be updated.' }, 503);
  if (!data) return reply({ success: false, error: 'Deletion request not found or already actioned.' }, 404);
  return reply({ success: true });
}
