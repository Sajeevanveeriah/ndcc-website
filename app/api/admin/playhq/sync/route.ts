import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;

export async function GET() {
  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403, headers: noStore });
  return NextResponse.json({ success: true, message: 'PlayHQ admin endpoint is available.' }, { headers: noStore });
}

export async function POST() {
  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403, headers: noStore });
  return NextResponse.json({ success: false, error: 'Configure PlayHQ source details before executing imports.' }, { status: 400, headers: noStore });
}
