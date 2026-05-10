import { NextResponse } from 'next/server';
import { getClubSettings } from '@/lib/club-settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await getClubSettings();
  return NextResponse.json({ success: true, data });
}
