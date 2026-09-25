'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { clubAccountJsonFetch } from '@/lib/club-account/browser';
import { emptyPreferences, INTERESTS, VOLUNTEERING, type MemberPreferences } from '@/lib/club-account/preferences';
export default function MemberInterests({ profileComplete, editProfile }: { profileComplete: boolean; editProfile: () => void }) {
  const [value, setValue] = useState<MemberPreferences>(emptyPreferences);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoaded(false); setError('');
    clubAccountJsonFetch<{ preferences: MemberPreferences }>('/api/club-account/preferences')
      .then(data => { if (active) { setValue(data.preferences); setLoaded(true); } })
      .catch(() => { if (active) setError('Your interests could not be loaded. Please retry.'); });
    return () => { active = false; };
  }, [retry]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await clubAccountJsonFetch<{ preferences: MemberPreferences }>('/api/club-account/preferences', { method: 'PUT', body: JSON.stringify(value) });
      setValue(result.preferences); setMessage('Your interests and email preference are saved. You can change them here at any time.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Your choices could not be saved.'); }
    finally { setBusy(false); }
  }
  function toggle(group: 'interests' | 'volunteering', key: string) {
    setMessage('');
    setValue(previous => ({ ...previous, [group]: previous[group].includes(key as never) ? previous[group].filter(item => item !== key) : [...previous[group], key] }));
  }
  return <section aria-labelledby="member-interests-heading" className="space-y-5">
    <div><h2 id="member-interests-heading" className="text-2xl font-bold">Your interests</h2><p className="mt-2 text-content-secondary">Tell the club what you would like to hear about and where you might like to help. Every choice is optional.</p></div>
    {!profileComplete && <p className="rounded-xl bg-surface-muted p-4">Save your contact details first so the committee knows who to contact. <button className="underline" onClick={editProfile}>Add my details</button></p>}
    {error && <p role="alert">{error} {!loaded && <button className="underline" onClick={() => setRetry(retry + 1)}>Retry loading interests</button>}</p>}
    {!loaded && !error && <p role="status">Loading your interests...</p>}
    <form onSubmit={save} className="space-y-6">
      <fieldset disabled={!loaded || busy || !profileComplete} className="space-y-6 disabled:opacity-60">
        <fieldset><legend className="mb-3 font-semibold">Keep me in the loop about</legend><div className="grid gap-3 sm:grid-cols-2">{Object.entries(INTERESTS).map(([key, label]) => <label className="flex items-start gap-3 rounded-lg border border-edge-subtle p-3" key={key}><input type="checkbox" className="mt-1" checked={value.interests.includes(key as keyof typeof INTERESTS)} onChange={() => toggle('interests', key)} />{label}</label>)}</div></fieldset>
        <fieldset><legend className="mb-2 font-semibold">I might be able to help with</legend><p className="mb-3 text-sm text-content-secondary">This records your interest. It does not book you for a shift.</p><div className="grid gap-3 sm:grid-cols-2">{Object.entries(VOLUNTEERING).map(([key, label]) => <label className="flex items-start gap-3 rounded-lg border border-edge-subtle p-3" key={key}><input type="checkbox" className="mt-1" checked={value.volunteering.includes(key as keyof typeof VOLUNTEERING)} onChange={() => toggle('volunteering', key)} />{label}</label>)}</div></fieldset>
        <label className="flex items-start gap-3 rounded-xl bg-surface-muted p-4"><input type="checkbox" className="mt-1" checked={value.email_updates} onChange={event => { setValue({ ...value, email_updates: event.target.checked }); setMessage(''); }} /><span>I am happy for the club to email me about my selected interests and volunteering opportunities.<span className="mt-2 block text-sm text-content-secondary">This choice is for club account contact lists. Order receipts and account security emails are separate.</span></span></label>
      </fieldset>
      {message && <p role="status" className="rounded-lg border border-green-300 p-3">{message}</p>}
      <Button type="submit" isLoading={busy} disabled={!loaded || !profileComplete}>Save my interests</Button>
    </form>
  </section>;
}
