import { NextResponse } from 'next/server';
import { getSponsorTiers } from '@/lib/cms-content';
export async function GET() { return NextResponse.json({ success: true, data: await getSponsorTiers() }); }
