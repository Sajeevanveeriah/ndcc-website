'use client';

import { useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input, { Select } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { CalendarDays, Pencil, Plus } from 'lucide-react';

type RoundStatus = 'draft' | 'open' | 'locked' | 'scored' | 'final';

type FantasyRound = {
  id: string;
  round_number: number;
  name: string;
  deadline_at: string | null;
  status: RoundStatus;
};

type RoundForm = {
  round_number: string;
  name: string;
  deadline_at: string;
  status: RoundStatus;
};

const emptyRound: RoundForm = {
  round_number: '',
  name: '',
  deadline_at: '',
  status: 'draft',
};

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'locked', label: 'Locked' },
  { value: 'scored', label: 'Scored' },
  { value: 'final', label: 'Final' },
];

function toDatetimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function formatDeadline(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function sortRounds(rounds: FantasyRound[]) {
  return rounds.slice().sort((a, b) => a.round_number - b.round_number);
}

export default function AdminFantasyRoundsPage() {
  const [rounds, setRounds] = useState<FantasyRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RoundForm>(emptyRound);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    const fetchRounds = async () => {
      try {
        const response = await fetch('/api/admin/resources/fantasyRounds', { cache: 'no-store' });
        const result = await parseApiResponse<{ data?: FantasyRound[] }>(response);
        setRounds(sortRounds(result.data || []));
      } catch (err) {
        setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch fantasy rounds.' });
      } finally {
        setLoading(false);
      }
    };

    fetchRounds();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyRound);
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const openEdit = (round: FantasyRound) => {
    setEditingId(round.id);
    setForm({
      round_number: String(round.round_number),
      name: round.name,
      deadline_at: toDatetimeLocal(round.deadline_at),
      status: round.status,
    });
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    const roundNumber = Number(form.round_number);
    if (!Number.isInteger(roundNumber) || roundNumber < 1) errors.round_number = 'Round number must be a positive whole number.';
    if (!form.name.trim()) errors.name = 'Round name is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);

    const payload = {
      round_number: Number(form.round_number),
      name: form.name.trim(),
      deadline_at: form.deadline_at ? new Date(form.deadline_at).toISOString() : null,
      status: form.status,
    };

    try {
      if (editingId) {
        const response = await adminFetch('/api/admin/resources/fantasyRounds', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        const result = await parseApiResponse<{ data: FantasyRound }>(response);
        setRounds((prev) => sortRounds(prev.map((item) => (item.id === editingId ? result.data : item))));
        setFeedback({ type: 'success', message: 'Fantasy round updated.' });
      } else {
        const response = await adminFetch('/api/admin/resources/fantasyRounds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await parseApiResponse<{ data: FantasyRound }>(response);
        setRounds((prev) => sortRounds([...prev, result.data]));
        setFeedback({ type: 'success', message: 'Fantasy round added.' });
      }
      setModalOpen(false);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save fantasy round.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-maroon-700" />
            Fantasy Rounds
          </h1>
          <p className="text-gray-500 font-body mt-1">{rounds.length} round{rounds.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Round</Button>
      </div>

      {feedback && <p className={`mb-4 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : rounds.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <CalendarDays className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-body">No fantasy rounds yet. Add rounds when the season structure is ready.</p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Round</TableHeader>
              <TableHeader>Name</TableHeader>
              <TableHeader>Deadline</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rounds.map((round) => (
              <TableRow key={round.id}>
                <TableCell className="font-medium">{round.round_number}</TableCell>
                <TableCell>{round.name}</TableCell>
                <TableCell>{formatDeadline(round.deadline_at)}</TableCell>
                <TableCell><Badge variant={round.status === 'open' ? 'success' : round.status === 'locked' ? 'warning' : 'default'}>{round.status}</Badge></TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(round)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Fantasy Round' : 'Add Fantasy Round'}>
        <div className="space-y-4">
          <Input id="fantasy-round-number" label="Round number" type="number" min="1" step="1" value={form.round_number} onChange={(e) => setForm({ ...form, round_number: e.target.value })} error={formErrors.round_number} required />
          <Input id="fantasy-round-name" label="Round name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={formErrors.name} required />
          <Input id="fantasy-round-deadline" label="Deadline (optional)" type="datetime-local" value={form.deadline_at} onChange={(e) => setForm({ ...form, deadline_at: e.target.value })} />
          <Select id="fantasy-round-status" label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as RoundStatus })} options={statusOptions} required />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} isLoading={saving}>Save Round</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
