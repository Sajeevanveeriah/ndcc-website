import { NextResponse } from 'next/server';
import { getCommitteeMembers } from '@/lib/structured-content';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

// Active committee members for the public contact page. Data comes from the CMS
// committee_members table via an uncached live read, so admin edits are always
// reflected immediately without a redeploy.
export async function GET() {
  try {
    const data = await getCommitteeMembers();
    return NextResponse.json({ success: true, data }, { headers: noStoreHeaders });
  } catch (err) {
    console.error('[public-committee] Failed to load committee members:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to load committee members.' },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
