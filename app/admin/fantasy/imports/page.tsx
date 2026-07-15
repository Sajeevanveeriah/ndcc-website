'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import Card, { CardContent } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import type { FantasyImportBatchSummary, FantasyImportStatus } from '@/lib/fantasy-leaderboard';
import { FileSearch, Upload } from 'lucide-react';

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

export default function AdminFantasyImportsPage() {
  const [batches, setBatches] = useState<FantasyImportBatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const response = await adminFetch('/api/admin/fantasy/imports', { cache: 'no-store' });
        const result = await parseApiResponse<{ batches: FantasyImportBatchSummary[] }>(response);
        setBatches(result.batches || []);
      } catch (err) {
        setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Import batches could not be loaded.' });
      } finally {
        setLoading(false);
      }
    };

    fetchBatches();
  }, []);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
            <FileSearch className="h-6 w-6 text-maroon-700 dark:text-maroon-200" />
            Fantasy Import Review
          </h1>
          <p className="text-content-muted font-body mt-1">Review saved CSV batches before publishing scores to the public leaderboard.</p>
        </div>
        <Link href="/admin/fantasy/import" className="btn-secondary">
          <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
          New Import
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 font-body">
        Draft, reviewed, and rejected imports remain admin-only. Only published batches can appear on the public leaderboard.
      </div>

      {feedback && <p className={`mb-4 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>}

      {loading ? (
        <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : batches.length === 0 ? (
        <Card>
          <CardContent className="text-center py-10">
            <p className="text-content-secondary font-body mb-4">No fantasy import batches have been saved yet.</p>
            <Link href="/admin/fantasy/import" className="btn-primary">Create Draft Import</Link>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Filename</TableHeader>
              <TableHeader>Source</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Created</TableHeader>
              <TableHeader>Rows</TableHeader>
              <TableHeader>Total points</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {batches.map((batch) => (
              <TableRow key={batch.id}>
                <TableCell className="font-medium">{batch.filename || 'Untitled CSV import'}</TableCell>
                <TableCell>{batch.source}</TableCell>
                <TableCell><Badge variant={statusVariant(batch.status)}>{batch.status}</Badge></TableCell>
                <TableCell>{formatDate(batch.created_at)}</TableCell>
                <TableCell>{batch.rowCount}</TableCell>
                <TableCell>{batch.totalPreviewPoints}</TableCell>
                <TableCell>
                  <Link href={`/admin/fantasy/imports/${batch.id}`} className="text-maroon-700 dark:text-maroon-200 hover:underline font-semibold">
                    Review
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
