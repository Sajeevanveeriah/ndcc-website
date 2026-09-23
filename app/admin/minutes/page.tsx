'use client';

import { useEffect, useRef, useState } from 'react';
import Input, { Textarea } from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { MINUTE_FILE_ACCEPT, MINUTE_FILE_LIMIT, minuteFileType } from '@/lib/meeting-minute-files';
import { parseApiResponse } from '@/lib/admin-client';
import DraftRestorePrompt from '@/components/admin/DraftRestorePrompt';
import { useDraftAutosave } from '@/components/admin/useDraftAutosave';
import { useUnsavedChangesGuard } from '@/components/admin/useUnsavedChangesGuard';

type Minute = { id: string; title: string; meeting_date: string; content: string; status: string; attachment_name?: string | null };

export default function AdminMinutesPage() {
  const [minutes, setMinutes] = useState<Minute[]>([]);
  const [form, setForm] = useState({ title: '', meeting_date: '', content: '', status: 'draft' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Typed fields are kept as a local draft; a selected file cannot be stored.
  const draft = useDraftAutosave({ editor: 'meeting-minutes', recordId: editingId, value: form, active: true });
  useUnsavedChangesGuard(draft.dirty || Boolean(file));
  const restoreDraft = () => {
    const saved = draft.restoreDraft();
    if (saved) setForm(saved);
  };
  const reset = () => {
    setForm({ title: '', meeting_date: '', content: '', status: 'draft' });
    setEditingId(null);
    setFile(null);
    setAttachmentName(null);
    setRemoveAttachment(false);
    if (fileInput.current) fileInput.current.value = '';
  };

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
    if (!form.content.trim() && !file && !(attachmentName && !removeAttachment)) {
      setMessage('Upload a document or type the minutes before saving.');
      return;
    }
    const method = editingId ? 'PATCH' : 'POST';
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => body.set(key, value));
    if (editingId) body.set('id', editingId);
    if (file) body.set('file', file);
    body.set('remove_attachment', String(removeAttachment));
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/meeting-minutes', { method, headers: { 'X-NDCC-CSRF': '1' }, body });
      await parseApiResponse(res);
      setMessage(editingId ? 'Minute updated.' : 'Minute created.');
      draft.clearDraft();
      reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save minute.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Meeting Minutes</h1>
      {message && <p role="status" className="text-sm text-content-muted">{message}</p>}
      {draft.pendingDraft && <DraftRestorePrompt savedAt={draft.pendingDraft.savedAt} onRestore={restoreDraft} onDiscard={draft.discardDraft} />}
      <form onSubmit={save} className="bg-surface-card border rounded-xl p-4">
        <fieldset disabled={saving} className="space-y-3">
        <Input id="title" label="Title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required />
        <Input id="meeting_date" label="Meeting Date" type="date" value={form.meeting_date} onChange={(e) => setForm((p) => ({ ...p, meeting_date: e.target.value }))} required />
        <div className="space-y-2">
          <label htmlFor="minutes-file" className="block text-sm font-medium text-content-secondary">Upload minutes</label>
          <p id="minutes-file-help" className="text-sm text-content-muted">Choose a PDF or Word document (.pdf, .doc or .docx), up to 4 MB. You can also type minutes below, or include both.</p>
          <input ref={fileInput} id="minutes-file" type="file" accept={MINUTE_FILE_ACCEPT} aria-describedby="minutes-file-help" className="block w-full max-w-full text-sm file:mr-3 file:rounded file:border file:px-3 file:py-2" onChange={(e) => {
            const selected = e.target.files?.[0] || null;
            if (selected && (!minuteFileType(selected.name) || selected.size === 0 || selected.size > MINUTE_FILE_LIMIT)) {
              setMessage('Choose a PDF or Word document up to 4 MB.');
              e.target.value = '';
              setFile(null);
              return;
            }
            setFile(selected);
            setMessage('');
          }} />
          {attachmentName && !removeAttachment && editingId && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <a className="underline break-all" href={`/api/meeting-minutes/${editingId}/document`}>Download {attachmentName}</a>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveAttachment(true)}>Remove attachment</Button>
            </div>
          )}
          {removeAttachment && <p className="text-sm text-content-muted">The current attachment will be removed when you save. <button type="button" className="underline" onClick={() => setRemoveAttachment(false)}>Undo</button></p>}
          {file && attachmentName && <p className="text-sm text-content-muted">The selected document will replace the current attachment when you save.</p>}
        </div>
        <Textarea id="content" label="Type minutes or add notes" value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} maxLength={50000} required={!file && !(attachmentName && !removeAttachment)} />
        <label className="text-sm font-medium text-content-secondary">Status
          <select className="mt-1 w-full border rounded px-3 py-2" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="accepted">accepted</option>
            <option value="seconded">seconded</option>
          </select>
        </label>
        <Button type="submit" isLoading={saving}>{editingId ? 'Update Minute' : 'Create Minute'}</Button>
        {editingId && <Button type="button" variant="ghost" onClick={reset}>Cancel editing</Button>}
        </fieldset>
      </form>

      <div className="bg-surface-card border rounded-xl divide-y">
        {minutes.map((m) => (
          <div key={m.id} className="p-4">
            <p className="font-semibold">{m.title}</p>
            <p className="text-sm text-content-muted">{m.meeting_date} · {m.status}</p>
            {m.attachment_name && <a className="block text-sm underline break-all my-2" href={`/api/meeting-minutes/${m.id}/document`}>Download {m.attachment_name}</a>}
            <Button disabled={saving} variant="ghost" size="sm" onClick={() => { reset(); setAttachmentName(m.attachment_name || null); setEditingId(m.id); setForm({ title: m.title, meeting_date: m.meeting_date, content: m.content, status: m.status }); }}>Edit</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
