import { NextResponse } from 'next/server';
import { getLiveKitchenOrderWindow } from '@/lib/kitchen-ordering-settings';
export const dynamic = 'force-dynamic';
export async function GET() { return NextResponse.json({ data: await getLiveKitchenOrderWindow() }, { headers: { 'Cache-Control': 'no-store' } }); }
