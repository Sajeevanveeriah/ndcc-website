import { NextResponse } from 'next/server';
import { draftMode } from 'next/headers';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { PREVIEW_PERMISSIONS, isPreviewId, isPreviewType, previewPath, safeReturnPath } from '@/lib/preview';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303, headers: noStore });
}

/**
 * Preview an unpublished or scheduled item on its public page.
 *
 * GET ?type=news|event|content&id=<uuid> - a signed-in committee user with
 * the matching CMS permission gets Next.js draft mode (a signed, per-build
 * bypass cookie) and is redirected to the public page, which then renders
 * drafts with a "Preview - not published" banner.
 * GET ?exit=1&to=/path - leaves draft mode (no permission needed).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const draft = await draftMode();

  if (params.get('exit') === '1') {
    draft.disable();
    return redirectTo(request, safeReturnPath(params.get('to')));
  }

  const type = params.get('type');
  const id = params.get('id');
  if (!isPreviewType(type) || !isPreviewId(id)) {
    return NextResponse.json({ success: false, error: 'Choose an item to preview.' }, { status: 400, headers: noStore });
  }
  const user = await requirePermission(PREVIEW_PERMISSIONS[type]);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Sign in with an account that can edit this section to preview it.' }, { status: 403, headers: noStore });
  }

  let pageSlug: string | null = null;
  if (type === 'content') {
    const { data, error } = await createServerClient({ actorId: user.id }).from('content_blocks').select('page_slug').eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ success: false, error: 'Preview is temporarily unavailable. Please retry.' }, { status: 503, headers: noStore });
    if (!data) return NextResponse.json({ success: false, error: 'Page section not found.' }, { status: 404, headers: noStore });
    pageSlug = typeof data.page_slug === 'string' ? data.page_slug : null;
  }

  const path = previewPath(type, id, pageSlug);
  if (!path) return NextResponse.json({ success: false, error: 'Choose an item to preview.' }, { status: 400, headers: noStore });
  draft.enable();
  return redirectTo(request, path);
}
