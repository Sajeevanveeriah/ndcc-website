'use client';

import { useId, useState, type ReactNode } from 'react';
import Button from '@/components/ui/Button';
import type { ImportRowIssue } from '@/lib/match-day';

const MAX_FILE_BYTES = 500_000;

/**
 * Paste rows from a spreadsheet (or choose a CSV file), check them, then
 * import as drafts or publish straight away. The parent supplies the parser,
 * the preview and the save call, so team sheets and winners share one flow.
 */
export default function BulkImport<T>({ title, help, template, templateName, parse, renderPreview, onImport }: {
  title: string;
  help: ReactNode;
  template: string;
  templateName: string;
  parse: (text: string) => { items: T[]; issues: ImportRowIssue[] };
  renderPreview: (items: T[]) => ReactNode;
  onImport: (items: T[], publish: boolean) => Promise<string>;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [checked, setChecked] = useState<{ items: T[]; issues: ImportRowIssue[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function check(value = text) {
    setMessage(''); setError('');
    if (!value.trim()) { setChecked(null); setError('Paste some rows or choose a CSV file first.'); return; }
    setChecked(parse(value));
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setError('That file is too large. Import up to 300 rows at a time.'); return; }
    const value = await file.text();
    setText(value);
    check(value);
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([template], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = templateName; link.click();
    URL.revokeObjectURL(url);
  }

  async function run(publish: boolean) {
    if (!checked || checked.issues.length || !checked.items.length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      setMessage(await onImport(checked.items, publish));
      setText(''); setChecked(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The import could not be saved. Nothing after the failed row was saved; fix it and import again.');
    } finally { setBusy(false); }
  }

  return <section className="rounded-xl border border-edge-subtle bg-surface-card p-5 space-y-4" aria-labelledby={`${id}-title`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id={`${id}-title`} className="font-display text-lg font-bold text-content-primary">{title}</h2>
        <div className="mt-1 text-sm text-content-secondary">{help}</div>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={downloadTemplate}>Download template</Button>
    </div>
    <label htmlFor={`${id}-text`} className="form-label">Paste rows (including the heading row) from Excel, Google Sheets or a CSV</label>
    <textarea id={`${id}-text`} className="form-input min-h-40 w-full font-mono text-sm" value={text} spellCheck={false}
      onChange={(event) => { setText(event.target.value); setChecked(null); setMessage(''); }} />
    <div className="flex flex-wrap items-center gap-3">
      <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-edge-strong px-4 text-sm font-semibold text-content-primary hover:bg-surface-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600">
        Choose CSV file
        <input type="file" accept=".csv,text/csv,text/plain,.tsv" className="sr-only" onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ''; }} />
      </label>
      <Button type="button" variant="secondary" onClick={() => check()} disabled={busy}>Check rows</Button>
    </div>
    {checked && <div className="space-y-3" aria-live="polite">
      {checked.issues.length > 0 ? <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
        <p className="font-semibold">Fix these before importing:</p>
        <ul className="mt-1 list-disc pl-5">{checked.issues.slice(0, 20).map((issue, index) => <li key={index}>{issue.row > 0 ? `Row ${issue.row}: ` : ''}{issue.error}</li>)}</ul>
        {checked.issues.length > 20 && <p className="mt-1">…and {checked.issues.length - 20} more.</p>}
      </div> : <p className="text-sm font-semibold text-status-success">{checked.items.length} ready to import.</p>}
      {checked.items.length > 0 && renderPreview(checked.items)}
      {checked.issues.length === 0 && checked.items.length > 0 && <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => void run(true)} isLoading={busy}>Import and publish</Button>
        <Button type="button" variant="secondary" onClick={() => void run(false)} disabled={busy}>Import as drafts</Button>
      </div>}
    </div>}
    {message && <p role="status" className="text-sm font-semibold text-status-success">{message}</p>}
    {error && <p role="alert" className="text-sm text-status-error">{error}</p>}
  </section>;
}
