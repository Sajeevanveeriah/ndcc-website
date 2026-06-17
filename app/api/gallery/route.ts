import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { normalizeGalleryImage } from '@/lib/public-content-normalizers';
import { normalizeImageSrc } from '@/lib/image-src';

export const revalidate = 300;
export const preferredRegion = 'syd1';

const getPublishedGalleryImages = unstable_cache(async () => {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('gallery_images')
    .select('id,title,caption,image_url,alt_text,allow_download,sort_order')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}, ['public-gallery'], { revalidate: 300, tags: ['gallery'] });

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ success: false, error: 'Service not configured.' }, { status: 503 });
  }

  const { data, error } = await getPublishedGalleryImages();

  if (error) {
    return NextResponse.json({ success: false, error }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data.map((item) => normalizeGalleryImage({ ...item, image_url: normalizeImageSrc(item.image_url) || '' })) }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } });
}
