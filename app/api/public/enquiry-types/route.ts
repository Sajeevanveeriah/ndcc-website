import { NextResponse } from 'next/server';
import { getEnquiryTypes } from '@/lib/cms-content';

export async function GET() {
  const data = await getEnquiryTypes();
  return NextResponse.json({ success: true, data });
}
