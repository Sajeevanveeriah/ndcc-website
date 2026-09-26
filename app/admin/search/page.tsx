import AdminSearchClient from './AdminSearchClient';

export const dynamic = 'force-dynamic';

export default async function AdminSearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const initialQuery = (Array.isArray(q) ? q[0] : q) || '';
  return <AdminSearchClient key={initialQuery} initialQuery={initialQuery.slice(0, 80)} />;
}
