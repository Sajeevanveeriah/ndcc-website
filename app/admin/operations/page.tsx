'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

type Health = { observedAt: string; databaseBytes: number; receiptQueue: Record<string, number>; emailOutcomes: Record<string, number>; lastEmailEvent: string | null; expiredSessions: number };

export default function OperationsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const response = await adminFetch('/api/admin/operations', { cache: 'no-store' });
      const result = await parseApiResponse<Health>(response);
      if (typeof result.observedAt !== 'string' || typeof result.databaseBytes !== 'number' || !result.receiptQueue || !result.emailOutcomes) {
        throw new Error('Operational checks returned an invalid response. Please retry.');
      }
      setHealth(result);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Operational checks are temporarily unavailable. Please retry.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function retry() {
    setBusy(true); setMessage('');
    try {
      const response = await adminFetch('/api/admin/operations', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(`Processed ${result.claimed} due receipt jobs. ${result.delivered} accepted by the email provider.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Retry unavailable.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-8">
    <div><h1 className="text-3xl font-display font-bold">Website operations</h1><p className="mt-2 text-content-muted">Measured health, delivery evidence and account controls.</p></div>
    {message && <p role="status" className="rounded border border-edge-subtle p-4">{message}</p>}
    {loadError && <p role="alert" className="rounded border border-edge-subtle p-4">{loadError}</p>}
    <button className="btn-secondary" disabled={loading || busy} onClick={() => void refresh()}>{loading ? 'Loading checks...' : 'Refresh checks'}</button>
    {health && <>
      <p className="text-sm text-content-muted">Checked {new Date(health.observedAt).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })} (Melbourne time).</p>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-edge-subtle p-6"><h2 className="text-xl font-semibold">Database</h2><p className="mt-3 text-3xl font-semibold">{(health.databaseBytes / 1_000_000).toFixed(1)} MB</p><p className="mt-2 text-sm text-content-muted">Postgres database size. Storage, traffic and monthly billing usage are separate measures.</p><p className="mt-3">Expired sessions awaiting retention review: {health.expiredSessions}</p></section>
        <section className="rounded-lg border border-edge-subtle p-6"><h2 className="text-xl font-semibold">Receipt queue</h2><dl className="mt-3 space-y-2">{Object.entries(health.receiptQueue).map(([status, count]) => <div key={status} className="flex justify-between"><dt>{status === 'delivered' ? 'Accepted by provider' : status.replaceAll('_', ' ')}</dt><dd>{count}</dd></div>)}</dl><button className="btn-secondary mt-5" disabled={busy} onClick={retry}>{busy ? 'Processing...' : 'Process due receipts'}</button><p className="mt-3 text-sm text-content-muted">Uses the existing queue and send protection. Only due jobs are processed.</p></section>
      </div>
      <section className="rounded-lg border border-edge-subtle p-6"><h2 className="text-xl font-semibold">Email outcomes in the last 30 days</h2><p className="mt-2 text-sm text-content-muted">Provider acceptance does not confirm delivery. Webhook evidence starts when monitoring is enabled.</p><dl className="mt-4 flex flex-wrap gap-8">{Object.entries(health.emailOutcomes).map(([status, count]) => <div key={status}><dt>{status.replace('email.', '').replaceAll('_', ' ')}</dt><dd className="text-2xl font-semibold">{count}</dd></div>)}</dl><p className="mt-3 text-sm">{health.lastEmailEvent ? `Latest event: ${new Date(health.lastEmailEvent).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })}` : 'No verified delivery events recorded yet.'}</p></section>
    </>}
    <section className="space-y-3"><h2 className="text-xl font-semibold">Quota, billing and recovery</h2><p className="text-content-muted">Check the provider billing period and plan before changing capacity. This page does not claim to measure account quotas or verify backups.</p><div className="flex flex-wrap gap-5"><a className="underline" href="https://supabase.com/dashboard/project/alduwuipmmnzorcgkcli" target="_blank" rel="noopener noreferrer">Supabase usage and backups</a><a className="underline" href="https://vercel.com/sajeevan-veeriahs-projects" target="_blank" rel="noopener noreferrer">Vercel usage and deployments</a></div></section>
  </div>;
}
