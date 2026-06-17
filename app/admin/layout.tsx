import AdminShell from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const preferredRegion = 'syd1';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
