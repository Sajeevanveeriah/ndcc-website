'use client';

import { useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input, { Select } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Pencil, Plus, Upload, Users } from 'lucide-react';

type PlayerRole = 'WK' | 'BAT' | 'AR' | 'BOWL';

type FantasyPlayer = {
  id: string;
  display_name: string;
  playhq_player_id: string | null;
  role: PlayerRole;
  team_label: string | null;
  active: boolean;
  price_million: number;
};

type PlayerForm = {
  display_name: string;
  playhq_player_id: string;
  role: PlayerRole | '';
  team_label: string;
  active: boolean;
  price_million: string;
};

const emptyPlayer: PlayerForm = {
  display_name: '',
  playhq_player_id: '',
  role: '',
  team_label: '',
  active: true,
  price_million: '0.0',
};

const roleOptions = [
  { value: 'WK', label: 'Wicket keeper' },
  { value: 'BAT', label: 'Batter' },
  { value: 'AR', label: 'All-rounder' },
  { value: 'BOWL', label: 'Bowler' },
];

function sortPlayers(players: FantasyPlayer[]) {
  return players.slice().sort((a, b) => a.display_name.localeCompare(b.display_name));
}

export default function AdminFantasyPlayersPage() {
  const [players, setPlayers] = useState<FantasyPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlayerForm>(emptyPlayer);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [csvImport, setCsvImport] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const response = await fetch('/api/admin/fantasy/players', { cache: 'no-store' });
        const result = await parseApiResponse<{ data?: FantasyPlayer[] }>(response);
        setPlayers(sortPlayers(result.data || []));
      } catch (err) {
        setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch fantasy players.' });
      } finally {
        setLoading(false);
      }
    };

    fetchPlayers();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyPlayer);
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const openEdit = (player: FantasyPlayer) => {
    setEditingId(player.id);
    setForm({
      display_name: player.display_name,
      playhq_player_id: player.playhq_player_id || '',
      role: player.role,
      team_label: player.team_label || '',
      active: player.active,
      price_million: player.price_million.toFixed(1),
    });
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.display_name.trim()) errors.display_name = 'Player name is required.';
    if (!form.role) errors.role = 'Role is required.';
    const price = Number(form.price_million);
    if (!Number.isFinite(price) || price < 0 || price > 99.9) errors.price_million = 'Price must be between 0.0 and 99.9.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);

    const payload = {
      display_name: form.display_name.trim(),
      playhq_player_id: form.playhq_player_id.trim() || null,
      role: form.role,
      team_label: form.team_label.trim() || null,
      active: form.active,
      price_million: Number(Number(form.price_million).toFixed(1)),
    };

    try {
      if (editingId) {
        const response = await adminFetch('/api/admin/fantasy/players', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        const result = await parseApiResponse<{ data: FantasyPlayer }>(response);
        setPlayers((prev) => sortPlayers(prev.map((item) => (item.id === editingId ? result.data : item))));
        setFeedback({ type: 'success', message: 'Fantasy player updated.' });
      } else {
        const response = await adminFetch('/api/admin/fantasy/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await parseApiResponse<{ data: FantasyPlayer }>(response);
        setPlayers((prev) => sortPlayers([...prev, result.data]));
        setFeedback({ type: 'success', message: 'Fantasy player added.' });
      }
      setModalOpen(false);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save fantasy player.' });
    } finally {
      setSaving(false);
    }
  };


  const parseCsvLine = (line: string) => line.split(',').map((value) => value.trim());

  const handleCsvImport = async () => {
    setFeedback(null);
    const lines = csvImport.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      setFeedback({ type: 'error', message: 'CSV import needs a header row and at least one player row.' });
      return;
    }
    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
    const required = ['display_name', 'role', 'price_million'];
    const missing = required.filter((header) => !headers.includes(header));
    if (missing.length > 0) {
      setFeedback({ type: 'error', message: `Missing required CSV column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.` });
      return;
    }

    const playersToImport = lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
      return {
        display_name: row.display_name,
        role: row.role,
        price_million: row.price_million,
        playhq_player_id: row.playhq_player_id || null,
        team_label: row.team_label || null,
        active: row.active ? row.active.toLowerCase() !== 'false' : true,
      };
    });

    setImporting(true);
    try {
      const response = await adminFetch('/api/admin/fantasy/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: playersToImport }),
      });
      await parseApiResponse(response);
      const refreshed = await adminFetch('/api/admin/fantasy/players', { cache: 'no-store' });
      const result = await parseApiResponse<{ data?: FantasyPlayer[] }>(refreshed);
      setPlayers(sortPlayers(result.data || []));
      setCsvImport('');
      setFeedback({ type: 'success', message: `${playersToImport.length} fantasy player${playersToImport.length === 1 ? '' : 's'} imported.` });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to import fantasy players.' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-maroon-700" />
            Fantasy Players
          </h1>
          <p className="text-gray-500 font-body mt-1">{players.length} player{players.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Player</Button>
      </div>

      {feedback && <p className={`mb-4 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>}

      <div className="mb-6 rounded-xl border border-gray-100 bg-white p-4">
        <h2 className="text-lg font-display font-bold text-gray-900 flex items-center gap-2"><Upload className="h-5 w-5 text-maroon-700" />Manual CSV player import</h2>
        <p className="mt-1 text-sm text-gray-600 font-body">Use verified club records when PlayHQ public data is unavailable. Required columns: display_name, role, price_million. Optional: playhq_player_id, team_label, active.</p>
        <textarea className="form-input mt-3 min-h-28 w-full font-mono text-xs" value={csvImport} onChange={(event) => setCsvImport(event.target.value)} placeholder="display_name,role,price_million,playhq_player_id,team_label,active" aria-label="Fantasy player CSV import" />
        <div className="mt-3 flex justify-end"><Button variant="secondary" onClick={handleCsvImport} isLoading={importing}>Import CSV players</Button></div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : players.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-body">No fantasy players yet. Add players when the club registry is ready.</p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Role</TableHeader>
              <TableHeader>Team Label</TableHeader>
              <TableHeader>Price</TableHeader>
              <TableHeader>PlayHQ ID</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {players.map((player) => (
              <TableRow key={player.id}>
                <TableCell className="font-medium">{player.display_name}</TableCell>
                <TableCell>{player.role}</TableCell>
                <TableCell>{player.team_label || '—'}</TableCell>
                <TableCell>{player.price_million.toFixed(1)}</TableCell>
                <TableCell>{player.playhq_player_id || '—'}</TableCell>
                <TableCell>{player.active ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(player)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Fantasy Player' : 'Add Fantasy Player'}>
        <div className="space-y-4">
          <Input id="fantasy-player-name" label="Player name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} error={formErrors.display_name} required />
          <Select id="fantasy-player-role" label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as PlayerRole })} options={roleOptions} error={formErrors.role} required />
          <Input id="fantasy-player-price" label="Price (million)" type="number" min="0" max="99.9" step="0.1" value={form.price_million} onChange={(e) => setForm({ ...form, price_million: e.target.value })} error={formErrors.price_million} required />
          <Input id="fantasy-player-team" label="Team label (optional)" value={form.team_label} onChange={(e) => setForm({ ...form, team_label: e.target.value })} />
          <Input id="fantasy-player-playhq-id" label="PlayHQ player ID (optional)" value={form.playhq_player_id} onChange={(e) => setForm({ ...form, playhq_player_id: e.target.value })} />
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Active in fantasy registry
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} isLoading={saving}>Save Player</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
