'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { fantasyJsonFetch } from '@/lib/fantasy-browser';

export type TeamNameManager = { team_name: string; team_name_status?: string | null; team_name_locked?: boolean | null };

/** Lets a signed-in manager rename their Dino Coach team without re-saving the rest of the profile. */
export default function TeamNameEditor({ manager, onSaved }: { manager: TeamNameManager; onSaved: (next: TeamNameManager) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(manager.team_name);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const trimmed = draft.trim().replace(/\s+/g, ' ');

  const save = async () => {
    if (!trimmed) { setFeedback({ type: 'error', message: 'Enter a team name.' }); return; }
    if (trimmed.length > 80) { setFeedback({ type: 'error', message: 'Team names must be 80 characters or fewer.' }); return; }
    setSaving(true);
    setFeedback(null);
    try {
      const result = await fantasyJsonFetch<{ manager: TeamNameManager; unchanged?: boolean }>('/api/fantasy/manager/team-name', { method: 'POST', body: JSON.stringify({ teamName: trimmed }) });
      onSaved(result.manager);
      setDraft(result.manager.team_name);
      setEditing(false);
      setFeedback({ type: 'success', message: result.unchanged ? 'Your team name is unchanged.' : `Team name changed to ${result.manager.team_name}.` });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Could not change your team name.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="team-name-heading" className="rounded-lg border border-edge-subtle p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="team-name-heading" className="font-display font-bold text-content-primary">Team name</h2>
        {!editing && !manager.team_name_locked && (
          <Button size="sm" variant="secondary" onClick={() => { setDraft(manager.team_name); setFeedback(null); setEditing(true); }}>Change team name</Button>
        )}
      </div>
      {!editing && <p className="font-body text-lg font-semibold text-content-primary wrap-break-word">{manager.team_name}</p>}
      {manager.team_name_locked && <p className="text-sm font-body text-content-muted">The league manager set this name and locked it. Contact the club if it needs to change.</p>}
      {!manager.team_name_locked && manager.team_name_status === 'review_required' && !editing && <p className="text-sm font-body text-content-muted">This name is waiting for committee approval. You can choose a different name instead.</p>}
      {editing && (
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <Input id="newTeamName" label="New team name" value={draft} maxLength={80} autoComplete="off" onChange={(event) => setDraft(event.target.value)} required />
          <p className="text-xs font-body text-content-muted">Up to 80 characters. Your new name shows on the public standings straight away. Names the committee does not allow are refused.</p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="sm" isLoading={saving} disabled={!trimmed || trimmed === manager.team_name}>Save team name</Button>
            <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => { setEditing(false); setDraft(manager.team_name); setFeedback(null); }}>Cancel</Button>
          </div>
        </form>
      )}
      {feedback && <p role={feedback.type === 'error' ? 'alert' : 'status'} className={`text-sm font-body ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>}
    </section>
  );
}
