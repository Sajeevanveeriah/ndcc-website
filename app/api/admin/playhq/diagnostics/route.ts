import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() { return NextResponse.json({ success: true, message: 'PlayHQ admin endpoint is available.' }, { headers: { 'Cache-Control': 'no-store' } }); }
export async function POST() { return NextResponse.json({ success: false, error: 'Configure PlayHQ source details before executing imports.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
