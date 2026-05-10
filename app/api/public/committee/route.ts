import { NextResponse } from 'next/server';
import { getCommitteeMembers } from '@/lib/structured-content';

export async function GET() {
  const data = await getCommitteeMembers();
  return NextResponse.json({ success: true, data });
}
