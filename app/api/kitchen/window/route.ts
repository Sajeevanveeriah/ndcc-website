import { NextResponse } from 'next/server';
import { getKitchenOrderWindow } from '@/lib/kitchen-order-window';
export const dynamic = 'force-dynamic';
export function GET() { return NextResponse.json({ data: getKitchenOrderWindow() }); }
