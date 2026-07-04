'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input, { Select } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { parseApiResponse } from '@/lib/admin-client';
import { Trash2 } from 'lucide-react';

type Lineage = {
  id: string;
  club_name: string;
  start_season: string;
  end_season: string;
  association_abbr: string;
  sort_order: number;
  is_active: boolean;
};

type Premiership = {
  id: string;
  team_label: string;
  season_label: string;
  competition_abbr: string;
  grade_label: string;
  sort_order: number;
  is_active: boolean;
};

type HistoryCompetition = {
  id: string;
  abbreviation: string;
  name: string;
};

type CommitteeMember = {
  id: string;
  name: string;
  role: string;
  sort_order: number;
  is_active: boolean;
};

export default function AdminHistoryPage() {
  const [lineage, setLineage] = useState<Lineage[]>([]);
  const [premierships, setPremierships] = useState<Premiership[]>([]);
  const [competitions, setCompetitions] = useState<HistoryCompetition[]>([]);
  const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([]);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const [lineageForm, setLineageForm] = useState({ id: '', club_name: '', start_season: '', end_season: '', association_abbr: '', sort_order: '1', is_active: true });
  const [premForm, setPremForm] = useState({ id: '', team_label: '1st XI', season_label: '', competition_abbr: 'GCA', grade_label: '', sort_order: '1', is_active: true });
  const [competitionForm, setCompetitionForm] = useState({ id: '', abbreviation: '', name: '' });
  const [committeeForm, setCommitteeForm] = useState({ id: '', name: '', role: '', sort_order: '1', is_active: true });
  const [committeeDeleteConfirm, setCommitteeDeleteConfirm] = useState<string | null>(null);

  const loadAll = useCallback(async function loadAll() {
    try {
      const [lineageRes, premRes, competitionsRes, committeeRes] = await Promise.all([
        fetch('/api/admin/resources/historyLineage', { cache: 'no-store' }),
        fetch('/api/admin/resources/historyPremierships', { cache: 'no-store' }),
        fetch('/api/admin/resources/historyCompetitions', { cache: 'no-store' }),
        fetch('/api/admin/resources/committeeMembers', { cache: 'no-store' }),
      ]);

      const [lineageData, premData, competitionsData, committeeData] = await Promise.all([
        parseApiResponse<{ data?: Lineage[] }>(lineageRes),
        parseApiResponse<{ data?: Premiership[] }>(premRes),
        parseApiResponse<{ data?: HistoryCompetition[] }>(competitionsRes),
        parseApiResponse<{ data?: CommitteeMember[] }>(committeeRes),
      ]);

      const competitionList = competitionsData.data || [];
      setLineage(lineageData.data || []);
      setPremierships(premData.data || []);
      setCompetitions(competitionList);
      setCommitteeMembers(committeeData.data || []);
      if (!competitionList.find((item) => item.abbreviation === premForm.competition_abbr) && competitionList[0]) {
        setPremForm((current) => ({ ...current, competition_abbr: competitionList[0].abbreviation }));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load history resources.');
    }
  }, [premForm.competition_abbr]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function saveLineage(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/resources/historyLineage', {
        method: lineageForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lineageForm.id ? {
          id: lineageForm.id,
          club_name: lineageForm.club_name.trim(),
          start_season: lineageForm.start_season.trim(),
          end_season: lineageForm.end_season.trim(),
          association_abbr: lineageForm.association_abbr.trim(),
          sort_order: Number(lineageForm.sort_order || 0),
          is_active: lineageForm.is_active,
        } : {
          club_name: lineageForm.club_name.trim(),
          start_season: lineageForm.start_season.trim(),
          end_season: lineageForm.end_season.trim(),
          association_abbr: lineageForm.association_abbr.trim(),
          sort_order: Number(lineageForm.sort_order || 0),
          is_active: lineageForm.is_active,
        }),
      });
      await parseApiResponse(res);
      setStatus(lineageForm.id ? 'Lineage entry updated.' : 'Lineage entry saved.');
      setLineageForm({ id: '', club_name: '', start_season: '', end_season: '', association_abbr: '', sort_order: '1', is_active: true });
      loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save lineage entry.');
    } finally {
      setSaving(false);
    }
  }

  async function savePremiership(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        team_label: premForm.team_label.trim(),
        season_label: premForm.season_label.trim(),
        competition_abbr: premForm.competition_abbr,
        grade_label: premForm.grade_label.trim(),
        sort_order: Number(premForm.sort_order || 0),
        is_active: premForm.is_active,
      };
      const res = await fetch('/api/admin/resources/historyPremierships', {
        method: premForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(premForm.id ? { id: premForm.id, ...payload } : payload),
      });
      await parseApiResponse(res);
      setStatus(premForm.id ? 'Premiership entry updated.' : 'Premiership entry saved.');
      setPremForm({ id: '', team_label: '1st XI', season_label: '', competition_abbr: competitions[0]?.abbreviation || 'GCA', grade_label: '', sort_order: '1', is_active: true });
      loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save premiership entry.');
    } finally {
      setSaving(false);
    }
  }

  async function saveCompetition(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { abbreviation: competitionForm.abbreviation.trim().toUpperCase(), name: competitionForm.name.trim() };
      const res = await fetch('/api/admin/resources/historyCompetitions', {
        method: competitionForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(competitionForm.id ? { id: competitionForm.id, ...payload } : payload),
      });
      await parseApiResponse(res);
      setStatus(competitionForm.id ? 'Competition updated.' : 'Competition saved.');
      setCompetitionForm({ id: '', abbreviation: '', name: '' });
      loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save competition.');
    } finally {
      setSaving(false);
    }
  }

  async function saveCommittee(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: committeeForm.name.trim(),
        role: committeeForm.role.trim(),
        sort_order: Number(committeeForm.sort_order || 0),
        is_active: committeeForm.is_active,
      };
      const res = await fetch('/api/admin/resources/committeeMembers', {
        method: committeeForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(committeeForm.id ? { id: committeeForm.id, ...payload } : payload),
      });
      await parseApiResponse(res);
      setStatus(committeeForm.id ? 'Committee member updated.' : 'Committee member saved.');
      setCommitteeForm({ id: '', name: '', role: '', sort_order: '1', is_active: true });
      loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save committee member.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCommittee(id: string) {
    try {
      const res = await fetch(`/api/admin/resources/committeeMembers?id=${id}`, { method: 'DELETE' });
      await parseApiResponse(res);
      setCommitteeMembers((prev) => prev.filter((member) => member.id !== id));
      if (committeeForm.id === id) {
        setCommitteeForm({ id: '', name: '', role: '', sort_order: '1', is_active: true });
      }
      setStatus('Committee member deleted.');
      setCommitteeDeleteConfirm(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete committee member.');
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-display font-bold">History & Committee</h1>
      <p className="text-sm text-gray-500">Manage lineage, competitions, premiership records, and the About page committee list.</p>
      {status && <p className="text-sm text-gray-600">{status}</p>}

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">History Competitions</h2>
        <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={saveCompetition}>
          <Input id="competition_abbr" label="Abbreviation" required value={competitionForm.abbreviation} onChange={(e) => setCompetitionForm((v) => ({ ...v, abbreviation: e.target.value }))} />
          <Input id="competition_name" label="Competition name" required value={competitionForm.name} onChange={(e) => setCompetitionForm((v) => ({ ...v, name: e.target.value }))} />
          <div className="flex items-end gap-2">
            <Button type="submit" isLoading={saving}>{competitionForm.id ? 'Update Competition' : 'Save Competition'}</Button>
            {competitionForm.id && <Button type="button" variant="secondary" onClick={() => setCompetitionForm({ id: '', abbreviation: '', name: '' })}>Cancel</Button>}
          </div>
        </form>
        <ul className="space-y-2 text-sm text-gray-700">
          {competitions.map((entry) => (
            <li key={entry.id} className="border rounded-lg px-3 py-2 flex items-center justify-between gap-3">
              <span>{entry.abbreviation} · {entry.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setCompetitionForm({ id: entry.id, abbreviation: entry.abbreviation, name: entry.name })}>Edit</Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Club Lineage</h2>
        <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={saveLineage}>
          <Input id="club_name" label="Club name" required value={lineageForm.club_name} onChange={(e) => setLineageForm((v) => ({ ...v, club_name: e.target.value }))} />
          <Input id="start_season" label="Start season" required value={lineageForm.start_season} onChange={(e) => setLineageForm((v) => ({ ...v, start_season: e.target.value }))} />
          <Input id="end_season" label="End season" required value={lineageForm.end_season} onChange={(e) => setLineageForm((v) => ({ ...v, end_season: e.target.value }))} />
          <Select id="association_abbr" label="Association" options={competitions.map((item) => ({ value: item.abbreviation, label: `${item.abbreviation} · ${item.name}` }))} value={lineageForm.association_abbr} onChange={(e) => setLineageForm((v) => ({ ...v, association_abbr: e.target.value }))} />
          <Input id="lineage_sort" label="Sort order" type="number" value={lineageForm.sort_order} onChange={(e) => setLineageForm((v) => ({ ...v, sort_order: e.target.value }))} />
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={lineageForm.is_active} onChange={(e) => setLineageForm((v) => ({ ...v, is_active: e.target.checked }))} />Active</label>
          <div className="md:col-span-3 flex gap-2">
            <Button type="submit" isLoading={saving}>{lineageForm.id ? 'Update Lineage' : 'Save Lineage'}</Button>
            {lineageForm.id && <Button type="button" variant="secondary" onClick={() => setLineageForm({ id: '', club_name: '', start_season: '', end_season: '', association_abbr: '', sort_order: '1', is_active: true })}>Cancel</Button>}
          </div>
        </form>

        <ul className="space-y-2 text-sm text-gray-700">
          {lineage.map((entry) => (
            <li key={entry.id} className="border rounded-lg px-3 py-2 flex items-center justify-between gap-3">
              <span>{entry.club_name} · {entry.start_season} to {entry.end_season} · {entry.association_abbr}</span>
              <Button size="sm" variant="ghost" onClick={() => setLineageForm({ id: entry.id, club_name: entry.club_name, start_season: entry.start_season, end_season: entry.end_season, association_abbr: entry.association_abbr, sort_order: String(entry.sort_order), is_active: entry.is_active })}>Edit</Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Premiership Records</h2>
        <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={savePremiership}>
          <Input id="team_label" label="Team" required value={premForm.team_label} onChange={(e) => setPremForm((v) => ({ ...v, team_label: e.target.value }))} />
          <Input id="season_label" label="Season" required value={premForm.season_label} onChange={(e) => setPremForm((v) => ({ ...v, season_label: e.target.value }))} />
          <Select id="prem_competition_abbr" label="Competition" options={competitions.map((item) => ({ value: item.abbreviation, label: `${item.abbreviation} · ${item.name}` }))} value={premForm.competition_abbr} onChange={(e) => setPremForm((v) => ({ ...v, competition_abbr: e.target.value }))} />
          <Input id="grade_label" label="Grade" required value={premForm.grade_label} onChange={(e) => setPremForm((v) => ({ ...v, grade_label: e.target.value }))} />
          <Input id="prem_sort" label="Sort order" type="number" value={premForm.sort_order} onChange={(e) => setPremForm((v) => ({ ...v, sort_order: e.target.value }))} />
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={premForm.is_active} onChange={(e) => setPremForm((v) => ({ ...v, is_active: e.target.checked }))} />Active</label>
          <div className="md:col-span-3 flex gap-2">
            <Button type="submit" isLoading={saving}>{premForm.id ? 'Update Premiership' : 'Save Premiership'}</Button>
            {premForm.id && <Button type="button" variant="secondary" onClick={() => setPremForm({ id: '', team_label: '1st XI', season_label: '', competition_abbr: competitions[0]?.abbreviation || 'GCA', grade_label: '', sort_order: '1', is_active: true })}>Cancel</Button>}
          </div>
        </form>

        <ul className="space-y-2 text-sm text-gray-700">
          {premierships.map((entry) => (
            <li key={entry.id} className="border rounded-lg px-3 py-2 flex items-center justify-between gap-3">
              <span>{entry.team_label} · {entry.season_label} · {entry.competition_abbr} · {entry.grade_label}</span>
              <Button size="sm" variant="ghost" onClick={() => setPremForm({ id: entry.id, team_label: entry.team_label, season_label: entry.season_label, competition_abbr: entry.competition_abbr, grade_label: entry.grade_label, sort_order: String(entry.sort_order), is_active: entry.is_active })}>Edit</Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Committee Members (About page)</h2>
        <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={saveCommittee}>
          <Input id="committee_name" label="Name" required value={committeeForm.name} onChange={(e) => setCommitteeForm((v) => ({ ...v, name: e.target.value }))} />
          <Input id="committee_role" label="Role" required value={committeeForm.role} onChange={(e) => setCommitteeForm((v) => ({ ...v, role: e.target.value }))} />
          <Input id="committee_sort" label="Sort order" type="number" value={committeeForm.sort_order} onChange={(e) => setCommitteeForm((v) => ({ ...v, sort_order: e.target.value }))} />
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={committeeForm.is_active} onChange={(e) => setCommitteeForm((v) => ({ ...v, is_active: e.target.checked }))} />Active</label>
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit" isLoading={saving}>{committeeForm.id ? 'Update Member' : 'Save Member'}</Button>
            {committeeForm.id && <Button type="button" variant="secondary" onClick={() => setCommitteeForm({ id: '', name: '', role: '', sort_order: '1', is_active: true })}>Cancel</Button>}
          </div>
        </form>
        <ul className="space-y-2 text-sm text-gray-700">
          {committeeMembers.map((member) => (
            <li key={member.id} className="border rounded-lg px-3 py-2 flex items-center justify-between gap-3">
              <span>{member.name} · {member.role} · sort {member.sort_order}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setCommitteeForm({ id: member.id, name: member.name, role: member.role, sort_order: String(member.sort_order), is_active: member.is_active })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setCommitteeDeleteConfirm(member.id)} aria-label={`Delete ${member.name}`}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Modal
        isOpen={!!committeeDeleteConfirm}
        onClose={() => setCommitteeDeleteConfirm(null)}
        title="Delete Committee Member"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Are you sure you want to delete this committee member? They will be removed from the About page.</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setCommitteeDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => committeeDeleteConfirm && deleteCommittee(committeeDeleteConfirm)}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
