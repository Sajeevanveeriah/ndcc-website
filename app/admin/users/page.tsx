'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

type User = { id: string; email: string; full_name: string; role: string; is_active: boolean };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('committee');

  const load = async () => {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    if (res.ok) setUsers(data.users);
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, fullName, password, role }),
    });
    if (res.ok) {
      setEmail(''); setFullName(''); setPassword(''); setRole('committee');
      load();
    }
  };

  const toggle = async (user: User) => {
    await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, isActive: !user.is_active }) });
    load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Committee Users</h1>
      <form onSubmit={create} className="bg-white p-4 rounded-xl border grid md:grid-cols-2 gap-3">
        <Input id="full-name" label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <Input id="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input id="password" type="password" label="Temporary password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <label className="text-sm font-medium text-gray-700">Role
          <select className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">admin</option><option value="president">president</option><option value="secretary">secretary</option><option value="committee">committee</option>
          </select>
        </label>
        <div className="md:col-span-2"><Button type="submit">Create User</Button></div>
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
