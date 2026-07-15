'use client';

import { useEffect, useState } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

type Diagnostics = {
  success: boolean;
  config: Record<string, unknown>;
  checks: Array<{ label: string; status: 'ok' | 'warn' | 'fail'; detail: string }>;
  connection: { status: 'ok' | 'warn' | 'fail'; detail: string };
  discovery: { organisation: string; season: string; grades: string };
  sync: { lastSuccess: string | null; lastFailure: string | null; nextScheduledRun: string };
  remediation: string[];
};

function statusClass(status: string) {
  if (status === 'ok') return 'bg-green-50 text-green-800 border-green-200';
  if (status === 'warn') return 'bg-yellow-50 text-yellow-900 border-yellow-200';
  return 'bg-red-50 text-red-800 border-red-200';
}

export default function PlayHQDiagnosticsPage() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/playhq/diagnostics', { cache: 'no-store', credentials: 'include' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Diagnostics failed.');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Diagnostics failed.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-content-primary">PlayHQ diagnostics</h1>
          <p className="mt-1 max-w-3xl text-sm text-content-muted font-body">Read-only checks for server-only PlayHQ configuration, discovery and Fantasy sync health. Secret values are never shown.</p>
        </div>
        <Button type="button" onClick={load} disabled={loading}>{loading ? 'Checking...' : 'Run checks again'}</Button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      {data && (
        <>
          <Card><CardContent>
            <h2 className="text-lg font-display font-bold text-content-primary">Configuration presence</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {data.checks.map((check) => (
                <div key={check.label} className={`rounded-lg border p-3 text-sm ${statusClass(check.status)}`}>
                  <div className="font-semibold">{check.label}</div>
                  <div className="mt-1">{check.detail}</div>
                </div>
              ))}
            </div>
          </CardContent></Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardContent>
              <h2 className="text-lg font-display font-bold text-content-primary">Connection and discovery</h2>
              <dl className="mt-4 space-y-3 text-sm font-body">
                <div><dt className="font-semibold text-content-primary">Connection test</dt><dd className={data.connection.status === 'ok' ? 'text-green-700' : 'text-red-700'}>{data.connection.detail}</dd></div>
                <div><dt className="font-semibold text-content-primary">Organisation discovery</dt><dd className="text-content-secondary">{data.discovery.organisation}</dd></div>
                <div><dt className="font-semibold text-content-primary">Season discovery</dt><dd className="text-content-secondary">{data.discovery.season}</dd></div>
                <div><dt className="font-semibold text-content-primary">Grade discovery</dt><dd className="text-content-secondary">{data.discovery.grades}</dd></div>
              </dl>
            </CardContent></Card>

            <Card><CardContent>
              <h2 className="text-lg font-display font-bold text-content-primary">Fantasy sync health</h2>
              <dl className="mt-4 space-y-3 text-sm font-body">
                <div><dt className="font-semibold text-content-primary">Last successful sync</dt><dd className="text-content-secondary">{data.sync.lastSuccess || 'No successful sync recorded.'}</dd></div>
                <div><dt className="font-semibold text-content-primary">Last failure</dt><dd className="text-content-secondary">{data.sync.lastFailure || 'No failed sync recorded.'}</dd></div>
                <div><dt className="font-semibold text-content-primary">Next scheduled run</dt><dd className="text-content-secondary">{data.sync.nextScheduledRun}</dd></div>
              </dl>
            </CardContent></Card>
          </div>

          <Card><CardContent>
            <h2 className="text-lg font-display font-bold text-content-primary">Plain-English remediation</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-content-secondary font-body">
              {data.remediation.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
