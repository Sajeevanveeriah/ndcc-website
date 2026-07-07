'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import type { FantasyImportBatchDetail, FantasyImportStatus } from '@/lib/fantasy-leaderboard';
import { ArrowLeft, CheckCircle2, Send, XCircle } from 'lucide-react';

function statusVariant(status: FantasyImportStatus) {
  if (status === 'published') return 'success' as const;
  if (status === 'reviewed') return 'info' as const;
  if (status === 'rejected') return 'danger' as const;
  return 'warning' as const;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function roundLabel(row: FantasyImportBatchDetail['rows'][number]) {
  if (typeof row.roundNumber !== 'number') return '—';
  return row.roundName ? `Round ${row.roundNumber}: ${row.roundName}` : `Round ${row.roundNumber}`;
}

export default function AdminFantasyImportDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [batch, setBatch] = useState<FantasyImportBatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState<FantasyImportStatus | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const fetchBatch = async () => {
    try {
      const response = await adminFetch(`/api/admin/fantasy/imports/${params.id}`, { cache: 'no-store' });
      const result = await parseApiResponse<{ batch: FantasyImportBatchDetail }>(response);
      setBatch(result.batch);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Import batch could not be loaded.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const updateStatus = async (status: FantasyImportStatus) => {
    setSavingStatus(status);
    setFeedback(null);
    try {
      const response = await adminFetch(`/api/admin/fantasy/imports/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await parseApiResponse(response);
      setFeedback({ type: 'success', message: `Import batch marked as ${status}.` });
      await fetchBatch();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Import batch status could not be updated.' });
    } finally {
      setSavingStatus(null);
    }
  };

  const canReview = batch?.status === 'draft';
  const canPublish = batch?.status === 'draft' || batch?.status === 'reviewed';
  const canReject = batch?.status === 'draft' || batch?.status === 'reviewed';

  if (loading) {
    return <div className="bg-white rounded-xl border border-gray-100 p-8 animate-pulse">Loading import batch...</div>;
  }

  if (!batch) {
    return (
      <div>
        <Button variant="ghost" onClick={() => router.push('/admin/fantasy/imports')}>Back to imports</Button>
        {feedback && <p className="mt-4 text-sm text-red-600">{feedback.message}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/fantasy/imports" className="inline-flex items-center text-maroon-700 hover:underline font-body font-semibold mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back to import review
        </Link>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900">{batch.filename || 'Untitled CSV import'}</h1>
            <p className="text-gray-500 font-body mt-1">Created {formatDate(batch.created_at)} from {batch.source}</p>
            {batch.source_url && (
              <p className="text-gray-500 font-body mt-1 text-sm">
                Source:{' '}
                <a href={batch.source_url} target="_blank" rel="noopener noreferrer" className="text-maroon-700 underline break-all">
                  {batch.source_url}
                </a>
                {batch.fetched_at ? ` (fetched ${formatDate(batch.fetched_at)})` : ''}
              </p>
            )}
          </div>
          <Badge variant={statusVariant(batch.status)}>{batch.status}</Badge>
        </div>
      </div>

      {feedback && <p className={`mb-4 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>}

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card><CardContent><p className="text-sm text-gray-500">Rows</p><p className="text-3xl font-display font-bold text-gray-900">{batch.rowCount}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-gray-500">Preview points</p><p className="text-3xl font-display font-bold text-gray-900">{batch.totalPreviewPoints}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-gray-500">Public visibility</p><p className="text-lg font-display font-bold text-gray-900">{batch.status === 'published' ? 'Published' : 'Admin only'}</p></CardContent></Card>
      </div>

      <Card className="mb-6">
        <CardHeader><h2 className="text-lg font-display font-bold text-gray-900">Review actions</h2></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={() => updateStatus('reviewed')} disabled={!canReview || !!savingStatus} isLoading={savingStatus === 'reviewed'}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Reviewed
            </Button>
            <Button onClick={() => updateStatus('published')} disabled={!canPublish || !!savingStatus} isLoading={savingStatus === 'published'}>
              <Send className="h-4 w-4 mr-2" /> Publish
            </Button>
            <Button variant="danger" onClick={() => updateStatus('rejected')} disabled={!canReject || !!savingStatus} isLoading={savingStatus === 'rejected'}>
              <XCircle className="h-4 w-4 mr-2" /> Reject
            </Button>
          </div>
          <p className="text-sm text-gray-600 font-body mt-4">Publishing makes this batch eligible for the public player leaderboard. Rejected and reviewed batches stay private.</p>
        </CardContent>
      </Card>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>Player</TableHeader>
            <TableHeader>Role</TableHeader>
            <TableHeader>Round</TableHeader>
            <TableHeader>Match date</TableHeader>
            <TableHeader>Opponent</TableHeader>
            <TableHeader>Runs</TableHeader>
            <TableHeader>Wkts</TableHeader>
            <TableHeader>Maidens</TableHeader>
            <TableHeader>Ct</TableHeader>
            <TableHeader>RO</TableHeader>
            <TableHeader>St</TableHeader>
            <TableHeader>Ducks</TableHeader>
            <TableHeader>Points</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {batch.rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.playerName}</TableCell>
              <TableCell>{row.playerRole || '—'}</TableCell>
              <TableCell>{roundLabel(row)}</TableCell>
              <TableCell>{row.matchDate || '—'}</TableCell>
              <TableCell>{row.opponent || '—'}</TableCell>
              <TableCell>{row.runs}</TableCell>
              <TableCell>{row.wickets}</TableCell>
              <TableCell>{row.maidens}</TableCell>
              <TableCell>{row.catches}</TableCell>
              <TableCell>{row.runouts}</TableCell>
              <TableCell>{row.stumpings}</TableCell>
              <TableCell>{row.ducks}</TableCell>
              <TableCell className="font-semibold">{row.points}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
