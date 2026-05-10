'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input, { Textarea } from '@/components/ui/Input';
import ImageUploadField from '@/components/admin/ImageUploadField';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

type Field = {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'checkbox' | 'image';
};

type Row = Record<string, string | number | boolean | null> & { id?: string };

type Props = {
  title: string;
  intro: string;
  resource: string;
  fields: Field[];
  newRow: Row;
  primaryLabel?: string;
};

export default function SimpleResourceManager({ title, intro, resource, fields, newRow, primaryLabel = 'title' }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const loadRows = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/resources/${resource}`, { cache: 'no-store' });
      const data = await parseApiResponse<{ data?: Row[] }>(res);
      const loaded = data.data || [];
      setRows(loaded);
      setSelected((current) => current || loaded[0] || null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to load records.');
    }
  }, [resource]);

  useEffect(() => { loadRows(); }, [loadRows]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    setFeedback('');
    try {
      const method = selected.id ? 'PATCH' : 'POST';
      const res = await adminFetch(`/api/admin/resources/${resource}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selected),
      });
      await parseApiResponse(res);
      setFeedback('Saved.');
      setSelected(null);
      await loadRows();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  function update(key: string, value: string | number | boolean) {
    setSelected((row) => row ? { ...row, [key]: value } : row);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">{title}</h1>
        <p className="text-sm text-gray-500 mt-1">{intro}</p>
      </div>
      {feedback && <p className="text-sm text-maroon-700">{feedback}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <Button size="sm" onClick={() => setSelected(newRow)}>Add new</Button>
          {rows.length === 0 && <p className="text-sm text-gray-500">No records yet.</p>}
          {rows.map((row) => (
            <button key={String(row.id || row[primaryLabel])} type="button" onClick={() => setSelected(row)} className="block w-full text-left rounded-lg border border-gray-100 px-3 py-2 hover:bg-sky-50">
              <span className="font-semibold text-sm">{String(row[primaryLabel] || row.label || row.name || 'Record')}</span>
              {'is_active' in row && <span className="block text-xs text-gray-500">{row.is_active ? 'Shown on website' : 'Hidden'}</span>}
            </button>
          ))}
        </div>
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          {!selected ? (
            <p className="text-gray-500">Select a record to edit.</p>
          ) : (
            <div className="space-y-4">
              {fields.map((field) => {
                const value = selected[field.key];
                if (field.type === 'textarea') {
                  return <Textarea key={field.key} id={field.key} label={field.label} value={String(value || '')} onChange={(e) => update(field.key, e.target.value)} rows={4} />;
                }
                if (field.type === 'checkbox') {
                  return (
                    <label key={field.key} className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <input type="checkbox" checked={Boolean(value)} onChange={(e) => update(field.key, e.target.checked)} />
                      {field.label}
                    </label>
                  );
                }
                if (field.type === 'image') {
                  return <ImageUploadField key={field.key} id={field.key} label={field.label} value={String(value || '')} onChange={(nextValue) => update(field.key, nextValue)} />;
                }
                return <Input key={field.key} id={field.key} label={field.label} type={field.type === 'number' ? 'number' : 'text'} value={String(value ?? '')} onChange={(e) => update(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)} />;
              })}
              <Button onClick={save} isLoading={saving}>Save</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
