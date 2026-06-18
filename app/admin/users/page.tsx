'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { parseApiResponse } from '@/lib/admin-client';

type User = { id: string; email: string; full_name: string; role: string; is_active: boolean };

const VALID_ROLES = ['admin', 'president', 'secretary', 'committee'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USER_PROVISIONING_PRESETS = [
  { fullName: 'John Elliott', role: 'president' },
  { fullName: 'Troy Whitworth', role: 'committee' },
  { fullName: 'Rick Mchutchinson', role: 'committee' },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('committee');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await parseApiResponse<{ users?: User[] }>(res);
      setUsers(data.users || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load users.');
    }
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim();
    const trimmedFullName = fullName.trim();

    if (!trimmedFullName) {
      setMessage('Full name is required.');
      return;
    }

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setMessage('Enter a valid email address.');
      return;
    }

    if (!VALID_ROLES.includes(role)) {
      setMessage('Select a valid role.');
      return;
    }

    if (password.length < 10) {
      setMessage('Temporary password must be at least 10 characters.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, fullName: trimmedFullName, password, role }),
      });
      await parseApiResponse(res);
      setEmail(''); setFullName(''); setPassword(''); setRole('committee');
      setMessage('User created.');
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (user: User) => {
    const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, isActive: !user.is_active }) });
    try {
      await parseApiResponse(res);
      setMessage(`User ${user.is_active ? 'deactivated' : 'activated'}.`);
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update user.');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Committee Users</h1>
      {message && <p className="text-sm text-gray-600">{message}</p>}
      <div className="bg-sky-50 border border-sky-100 rounded-xl p-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">Provisioning shortcuts</p>
        <div className="flex flex-wrap gap-2">
          {USER_PROVISIONING_PRESETS.map((preset) => (
            <Button key={preset.fullName} type="button" variant="secondary" onClick={() => { setFullName(preset.fullName); setRole(preset.role); }}>
              {preset.fullName}
            </Button>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-2">Enter the verified email address and a temporary password manually; passwords are never preset or committed.</p>
      </div>

      <form onSubmit={create} className="bg-white p-4 rounded-xl border grid md:grid-cols-2 gap-3">
        <Input id="full-name" label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <Input id="email" type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input id="password" type="password" label="Temporary password (minimum 10 characters)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required />
        <label className="text-sm font-medium text-gray-700">Role
          <select className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">admin</option><option value="president">president</option><option value="secretary">secretary</option><option value="committee">committee</option>
          </select>
        </label>
        <div className="md:col-span-2"><Button type="submit" isLoading={saving}>Create User</Button></div>
      </form>

      <div className="bg-white rounded-xl border divide-y">
        {users.map((u) => (
          <div key={u.id} className="p-4 flex items-center justify-between">
            <div><p className="font-semibold">{u.full_name}</p><p className="text-sm text-gray-500">{u.email} · {u.role}</p></div>
            <Button variant="secondary" onClick={() => toggle(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
