'use client';

import { ChangeEvent, useState } from 'react';
import Link from 'next/link';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import { FANTASY_IMPORT_COLUMNS, type FantasyImportPreview } from '@/lib/fantasy-scoring';
import { Upload } from 'lucide-react';

const csvColumns = FANTASY_IMPORT_COLUMNS;

type Feedback = {
  type: 'error' | 'success';
  message: string;
};

export default function AdminFantasyImportPage() {
  const [csvText, setCsvText] = useState('');
  const [filename, setFilename] = useState<string | null>(null);
  const [preview, setPreview] = useState<FantasyImportPreview | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFeedback({ type: 'error', message: 'Please choose a CSV file.' });
      return;
    }

    try {
      const text = await file.text();
      setCsvText(text);
      setFilename(file.name);
      setPreview(null);
      setFeedback(null);
    } catch {
      setFeedback({ type: 'error', message: 'The selected file could not be read.' });
    }
  };

  const validateCsv = async () => {
    setValidating(true);
    setFeedback(null);
    try {
      const response = await adminFetch('/api/admin/fantasy/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText }),
      });
      const result = await parseApiResponse<{ preview: FantasyImportPreview }>(response);
      setPreview(result.preview);
      if (result.preview.errors.length > 0 || result.preview.summary.errorRows > 0) {
        setFeedback({ type: 'error', message: 'CSV validation found issues. Review the summary and row errors before saving.' });
      } else {
        setFeedback({ type: 'success', message: 'CSV validation passed. Review the preview before saving a draft import.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'CSV validation failed.' });
    } finally {
      setValidating(false);
    }
  };

  const saveDraft = async () => {
    if (!preview || preview.summary.errorRows > 0 || preview.errors.length > 0) return;

    setSaving(true);
    setFeedback(null);
    try {
      const response = await adminFetch('/api/admin/fantasy/import/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, filename }),
      });
      const result = await parseApiResponse<{ batch: { id: string; status: string }; rowsSaved: number }>(response);
      setFeedback({ type: 'success', message: `Draft import ${result.batch.id} saved with ${result.rowsSaved} row${result.rowsSaved === 1 ? '' : 's'}. Status remains ${result.batch.status}.` });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Draft import could not be saved.' });
    } finally {
      setSaving(false);
    }
  };

  const canSave = !!preview && preview.summary.rowsParsed > 0 && preview.summary.errorRows === 0 && preview.errors.length === 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
          <Upload className="h-6 w-6 text-maroon-700" />
          Fantasy CSV Import
        </h1>
        <p className="text-gray-500 font-body mt-1">
          Validate manual match-stat CSV files and save admin-only draft imports for future Fantasy Cricket scoring.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 font-body">
        Draft import only. No public scores are published until a saved batch is reviewed and published.
        <Link href="/admin/fantasy/imports" className="ml-2 font-semibold underline">Review saved imports</Link>
      </div>

      {feedback && (
        <p className={`mb-4 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-display font-bold text-gray-900">CSV upload or paste</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label htmlFor="fantasy-csv-file" className="block text-sm font-semibold text-gray-700 font-body mb-2">
                  Upload CSV file
                </label>
                <input
                  id="fantasy-csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-maroon-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-maroon-800"
                />
                {filename && <p className="mt-2 text-xs text-gray-500">Selected file: {filename}</p>}
              </div>

              <div>
                <label htmlFor="fantasy-csv-text" className="block text-sm font-semibold text-gray-700 font-body mb-2">
                  Or paste CSV text
                </label>
                <textarea
                  id="fantasy-csv-text"
                  value={csvText}
                  onChange={(event) => {
                    setCsvText(event.target.value);
                    setFilename(null);
                    setPreview(null);
                  }}
                  className="min-h-64 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-maroon-500 focus:outline-none focus:ring-2 focus:ring-maroon-200"
                  placeholder={csvColumns.join(',')}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={validateCsv} isLoading={validating} disabled={!csvText.trim()}>
                  Validate CSV
                </Button>
                {canSave && (
                  <Button variant="secondary" onClick={saveDraft} isLoading={saving}>
                    Save Draft Import
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-display font-bold text-gray-900">Expected CSV columns</h2>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-gray-600 font-body">
              Prepare one row per player match stat line. Keep player names consistent with the Fantasy Players registry.
            </p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
              <code className="whitespace-nowrap text-sm text-gray-800">{csvColumns.join(',')}</code>
            </div>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600 font-body">
              <li><strong>match_date</strong> should use an ISO-style date such as YYYY-MM-DD.</li>
              <li><strong>not_out</strong> and <strong>player_of_match</strong> should be true or false values.</li>
              <li><strong>ducks</strong> should be numeric so deductions can be calculated consistently.</li>
              <li>Imports are saved as draft admin data only and are not shown on public Fantasy pages.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {preview && (
        <div className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-display font-bold text-gray-900">Preview summary</h2>
            </CardHeader>
            <CardContent>
              {preview.errors.length > 0 && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <ul className="list-disc pl-5">
                    {preview.errors.map((error) => <li key={error}>{error}</li>)}
                  </ul>
                </div>
              )}
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <SummaryItem label="Rows parsed" value={preview.summary.rowsParsed} />
                <SummaryItem label="Valid rows" value={preview.summary.validRows} />
                <SummaryItem label="Error rows" value={preview.summary.errorRows} />
                <SummaryItem label="Matched players" value={preview.summary.matchedPlayers} />
                <SummaryItem label="Matched rounds" value={preview.summary.matchedRounds} />
                <SummaryItem label="Total preview points" value={preview.summary.totalPreviewPoints} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-display font-bold text-gray-900">Row preview</h2>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Row</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Round</TableHeader>
                    <TableHeader>Date</TableHeader>
                    <TableHeader>Opponent</TableHeader>
                    <TableHeader>Player</TableHeader>
                    <TableHeader>Runs</TableHeader>
                    <TableHeader>Wickets</TableHeader>
                    <TableHeader>Points</TableHeader>
                    <TableHeader>Errors</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow key={row.rowNumber} className={row.errors.length > 0 ? 'bg-red-50 hover:bg-red-50' : undefined}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.errors.length > 0 ? 'Error' : 'Valid'}</TableCell>
                      <TableCell>{row.parsed?.round_number ?? row.raw.round_number}</TableCell>
                      <TableCell>{row.parsed?.match_date ?? row.raw.match_date}</TableCell>
                      <TableCell>{row.parsed?.opponent || row.raw.opponent || '—'}</TableCell>
                      <TableCell>{row.playerDisplayName || row.raw.player_name || '—'}</TableCell>
                      <TableCell>{row.parsed?.runs ?? row.raw.runs}</TableCell>
                      <TableCell>{row.parsed?.wickets ?? row.raw.wickets}</TableCell>
                      <TableCell>{row.points}</TableCell>
                      <TableCell className="min-w-56 text-xs text-red-700">
                        {row.errors.length > 0 ? row.errors.join('; ') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-xl font-display font-bold text-gray-900">{value}</dd>
    </div>
  );
}
