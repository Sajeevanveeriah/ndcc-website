'use client';

import { useEffect, useState } from 'react';
import Input, { Textarea } from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { parseApiResponse } from '@/lib/admin-client';

type Minute = { id: string; title: string; meeting_date: string; content: string; status: string };

export default function AdminMinutesPage() {
  const [minutes, setMinutes] = useState<Minute[]>([]);
  const [form, setForm] = useState({ title: '', meeting_date: '', content: '', status: 'draft' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const res = await fetch('/api/meeting-minutes', { cache: 'no-store' });
      const data = await parseApiResponse<{ minutes?: Minute[] }>(res);
      setMinutes(data.minutes || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load minutes.');
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingId ? 'PATCH' : 'POST';
    const body = editingId ? { id: editingId, ...form } : form;
    const res = await fetch('/api/meeting-minutes', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
      await parseApiResponse(res);
      setForm({ title: '', meeting_date: '', content: '', status: 'draft' });
      setEditingId(null);
      setMessage(editingId ? 'Minute updated.' : 'Minute created.');
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save minute.');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Meeting Minutes</h1>
      {message && <p className="text-sm text-gray-600">{message}</p>}
      <form onSubmit={save} className="bg-white border rounded-xl p-4 space-y-3">
        <Input id="title" label="Title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required />
        <Input id="meeting_date" label="Meeting Date" type="date" value={form.meeting_date} onChange={(e) => setForm((p) => ({ ...p, meeting_date: e.target.value }))} required />
        <Textarea id="content" label="Content" value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} required />
        <label className="text-sm font-medium text-gray-700">Status
          <select className="mt-1 w-full border rounded px-3 py-2" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="accepted">accepted</option>
            <option value="seconded">seconded</option>
          </select>
        </label>
        <Button type="submit">{editingId ? 'Update Minute' : 'Create Minute'}</Button>
      </form>

      <div className="bg-white border rounded-xl divide-y">
        {minutes.map((m) => (
          <div key={m.id} className="p-4">
            <p className="font-semibold">{m.title}</p>
            <p className="text-sm text-gray-500">{m.meeting_date} · {m.status}</p>
            <Button variant="ghost" size="sm" onClick={() => { setEditingId(m.id); setForm({ title: m.title, meeting_date: m.meeting_date, content: m.content, status: m.status }); }}>Edit</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
