import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';
import type { AuthRole } from '@/lib/auth/config';

const resourceMap: Record<string, { table: string; readRoles: Array<'admin' | 'president' | 'secretary' | 'committee'>; writeRoles: Array<'admin'> }> = {
  volunteers: { table: 'volunteers', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
  orders: { table: 'orders', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
  enquiries: { table: 'contacts', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
  events: { table: 'events', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
  news: { table: 'news', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
  sponsors: { table: 'sponsors', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
  membershipPlans: { table: 'social_membership_plans', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
  membershipAddons: { table: 'social_membership_addons', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
  membershipApplications: { table: 'member_applications', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
  volunteerPositions: { table: 'volunteer_positions', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
  volunteerExpressions: { table: 'volunteer_expressions', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
  galleryImages: { table: 'gallery_images', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
  apparelProducts: { table: 'apparel_products', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
  merchWindows: { table: 'merch_order_windows', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'] },
};

function pickResource(resource: string) {
  return resourceMap[resource];
}

function canRead(role: AuthRole, allowed: AuthRole[]) {
  return allowed.includes(role);
}

function canWrite(role: AuthRole) {
  return role === 'admin';
}

export async function GET(_request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user || !canRead(user.role, config.readRoles)) {
    return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.from(config.table).select('*').order('created_at', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user || !canWrite(user.role)) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const payload = await request.json();
  const supabase = createServerClient();
  const { data, error } = await supabase.from(config.table).insert(payload).select().single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function PATCH(request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user || !canWrite(user.role)) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { id, ...payload } = await request.json();
  if (!id) return NextResponse.json({ success: false, error: 'id is required.' }, { status: 400 });

  const supabase = createServerClient();
  const { data, error } = await supabase.from(config.table).update(payload).eq('id', id).select().single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user || !canWrite(user.role)) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id query param is required.' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase.from(config.table).delete().eq('id', id);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
