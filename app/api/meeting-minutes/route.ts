import { randomUUID } from 'node:crypto';
import { MINUTE_BUCKET, readMinuteForm, validateMinuteFile } from '@/lib/meeting-minute-files';
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { isUuidV1ToV5 } from '@/lib/validation/uuid';

export const dynamic = 'force-dynamic';

const MINUTE_STATUSES = new Set(['draft', 'published', 'accepted', 'seconded']);

function parseMinutePayload(body: Record<string, unknown>) {
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200
    || typeof body.meeting_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.meeting_date)
    || typeof body.content !== 'string' || body.content.length > 50_000
    || typeof body.status !== 'string' || !MINUTE_STATUSES.has(body.status)) {
    return null;
  }
  const parsedDate = new Date(`${body.meeting_date}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== body.meeting_date) return null;
  return {
    title: body.title.trim(),
    meeting_date: body.meeting_date,
    content: body.content.trim(),
    status: body.status,
  };
}

export async function GET() {
  const user = await requirePermission('minutes');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const query = supabase.from('meeting_minutes').select('*').order('meeting_date', { ascending: false });
  const { data, error } = user.role === 'committee' ? await query.neq('status', 'draft') : await query;

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, minutes: data || [] });
}

async function saveMinute(request: Request, editing: boolean) {
  const user = await requirePermission('minutes', ['admin', 'president', 'secretary']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });
  const supabase = createServerClient();
  let uploadedPath: string | null = null;
  try {
    let body: Record<string, unknown>;
    let file: File | null = null;
    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      const form = await readMinuteForm(request);
      body = Object.fromEntries(['id', 'title', 'meeting_date', 'content', 'status', 'remove_attachment'].map((key) => [key, form.get(key)]));
      const attachment = form.get('file');
      if (attachment && typeof attachment !== 'string' && attachment.size) file = attachment;
    } else {
      const raw = await readLimitedJsonObject(request, 64 * 1024);
      if (!raw.ok) return NextResponse.json({ success: false, error: raw.error }, { status: 400 });
      body = raw.value;
    }
    const payload = parseMinutePayload(body);
    const id = editing ? body.id : randomUUID();
    if (!payload || typeof id !== 'string' || !isUuidV1ToV5(id)) {
      return NextResponse.json({ success: false, error: 'Meeting minute details are invalid.' }, { status: 400 });
    }
    let existing: { attachment_path: string | null } | null = null;
    if (editing) {
      const result = await supabase.from('meeting_minutes').select('attachment_path').eq('id', id).single();
      if (result.error || !result.data) return NextResponse.json({ success: false, error: 'Minute not found.' }, { status: 404 });
      existing = result.data;
    }
    const remove = body.remove_attachment === 'true' || body.remove_attachment === true;
    if (!payload.content && !file && !(existing?.attachment_path && !remove)) {
      return NextResponse.json({ success: false, error: 'Upload a document or type the minutes before saving.' }, { status: 400 });
    }
    let attachmentFields: Record<string, unknown> = remove
      ? { attachment_path: null, attachment_name: null, attachment_type: null, attachment_size: null } : {};
    if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = validateMinuteFile(file.name, bytes);
      const path = `${id}/${randomUUID()}.${file.name.split('.').pop()!.toLowerCase()}`;
      const uploaded = await supabase.storage.from(MINUTE_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
      if (uploaded.error) throw new Error('The document could not be uploaded. Please try again.');
      uploadedPath = path;
      attachmentFields = { attachment_path: path, attachment_name: file.name.replace(/[\/\\\x00-\x1f\x7f]/g, '_').slice(-200), attachment_type: type, attachment_size: bytes.length };
    }
    const values = { ...payload, ...attachmentFields, updated_by: user.id, updated_at: new Date().toISOString() };
    const result = editing
      ? await supabase.from('meeting_minutes').update(values).eq('id', id).select().single()
      : await supabase.from('meeting_minutes').insert({ ...values, id, created_by: user.id }).select().single();
    if (result.error) {
      if (uploadedPath) await supabase.storage.from(MINUTE_BUCKET).remove([uploadedPath]);
      return NextResponse.json({ success: false, error: 'Minutes could not be saved. Your changes are still in the form; please try again.' }, { status: 500 });
    }
    // Previous attachments remain private for recovery; only the current record is downloadable.
    return NextResponse.json({ success: true, minute: result.data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to save minutes.' }, { status: 400 });
  }
}

export async function POST(request: Request) { return saveMinute(request, false); }
export async function PATCH(request: Request) { return saveMinute(request, true); }
