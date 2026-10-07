import { requirePermissionResult } from '@/lib/auth/guard';
import { createRows, deleteRow, denied, listRows, updateRows } from '@/lib/server/match-day-admin';
import { winnerResource } from '@/lib/server/match-day-resources';

export const dynamic = 'force-dynamic';

// Team sheets and winners sit with match reports under the Publications permission.
export async function GET() {
  const access = await requirePermissionResult('publications');
  return access.user ? listRows(winnerResource) : denied(access);
}
export async function POST(request: Request) {
  const access = await requirePermissionResult('publications');
  return access.user ? createRows(request, winnerResource, access.user) : denied(access);
}
export async function PATCH(request: Request) {
  const access = await requirePermissionResult('publications');
  return access.user ? updateRows(request, winnerResource, access.user) : denied(access);
}
export async function DELETE(request: Request) {
  const access = await requirePermissionResult('publications');
  return access.user ? deleteRow(request, winnerResource, access.user) : denied(access);
}
