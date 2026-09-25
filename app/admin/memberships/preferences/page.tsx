'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { INTERESTS, VOLUNTEERING } from '@/lib/club-account/preferences';
type Contact = { member_id: string; full_name: string; email: string; phone: string; status: string; interests: string[]; volunteering: string[]; email_updates: boolean };
export default function MemberPreferencesAdmin() {
  const [interest, setInterest] = useState(''); const [volunteer, setVolunteer] = useState(''); const [optedIn, setOptedIn] = useState(false);
  const [page, setPage] = useState(0); const [retry, setRetry] = useState(0); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [result, setResult] = useState<{ contacts: Contact[]; total: number } | null>(null);
  const query = new URLSearchParams({ interest, volunteer, opted_in: String(optedIn), page: String(page) }).toString();
  useEffect(() => {
    let active = true; const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000); setResult(null); setError('');
    void fetch(`/api/admin/memberships/preferences?${query}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not load contacts.'); if (active) setResult(body);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load contacts.'); }).finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [query, retry]);
  async function download() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/memberships/preferences?${query}&export=csv`, { cache: 'no-store' });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Could not export contacts.'); }
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a');
      link.href = url; link.download = 'NDCC-Opted-In-Contacts.csv'; link.click(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not export contacts.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6"><Link className="underline" href="/admin/memberships/directory">Back to member directory</Link>
    <div><h1 className="text-3xl font-bold">Member interests and volunteering</h1><p className="mt-3 max-w-3xl">Use members&apos; saved choices to plan activities and share relevant information. The email export includes only opted-in contacts whose club record is not inactive. It does not send an email.</p></div>
    <div className="grid gap-4 sm:grid-cols-2"><label>Interest<select className="form-input mt-1 w-full" value={interest} onChange={event => { setInterest(event.target.value); setPage(0); }}><option value="">All interests</option>{Object.entries(INTERESTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Volunteering<select className="form-input mt-1 w-full" value={volunteer} onChange={event => { setVolunteer(event.target.value); setPage(0); }}><option value="">All volunteering choices</option>{Object.entries(VOLUNTEERING).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
    <label className="flex gap-3"><input type="checkbox" checked={optedIn} onChange={event => { setOptedIn(event.target.checked); setPage(0); }} />Show only contacts eligible for the email export</label>
    <div className="flex flex-wrap gap-3"><Button isLoading={busy} onClick={() => void download()} disabled={!result}>Download opted-in contacts</Button><Button variant="secondary" onClick={() => setRetry(retry + 1)}>Refresh contacts</Button></div>
    {error && <p role="alert">{error}</p>}{!result && !error && <p role="status">Loading saved preferences...</p>}
    {result && <><p role="status">{result.total} members with saved preferences</p><div className="overflow-x-auto rounded-xl border border-edge-subtle"><table className="w-full text-left text-sm"><caption className="sr-only">Members matching the selected interests and volunteering choices</caption><thead><tr>{['Member', 'Interests', 'Volunteering', 'Email updates'].map(label => <th scope="col" key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{result.contacts.map(contact => <tr key={contact.member_id} className="border-t border-edge-subtle"><td className="p-3"><p className="font-semibold">{contact.full_name}</p><p>{contact.email}</p><p>{contact.phone}</p><p>Club record: {contact.status}</p></td><td className="p-3">{contact.interests.map(key => INTERESTS[key as keyof typeof INTERESTS]).join(', ') || 'No topics selected'}</td><td className="p-3">{contact.volunteering.map(key => VOLUNTEERING[key as keyof typeof VOLUNTEERING]).join(', ') || 'No roles selected'}</td><td className="p-3">{contact.email_updates ? 'Opted in' : 'Not opted in'}</td></tr>)}</tbody></table></div>
      {result.contacts.length === 0 && <p>No saved preferences match these filters.</p>}
      <div className="flex items-center gap-3"><Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous contacts</Button><span>Page {page + 1} of {Math.max(1, Math.ceil(result.total / 100))}</span><Button variant="secondary" disabled={(page + 1) * 100 >= result.total} onClick={() => setPage(page + 1)}>Next contacts</Button></div></>}
  </div>;
}
