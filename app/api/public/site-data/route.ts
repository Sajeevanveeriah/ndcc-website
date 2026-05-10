import { NextResponse } from 'next/server';
import { getNavigationLinks, getSiteSettings } from '@/lib/cms-content';

export async function GET() {
  const [settings, navigation, footerAffiliations] = await Promise.all([
    getSiteSettings(),
    getNavigationLinks('main'),
    getNavigationLinks('footer_affiliations'),
  ]);
  return NextResponse.json({ success: true, data: { settings, navigation, footerAffiliations } });
}
