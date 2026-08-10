'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input, { PasswordInput } from '@/components/ui/Input';
import { parseApiResponse } from '@/lib/admin-client';
import { AUTH_ROLES, type AuthRole } from '@/lib/auth/config';
import { FANTASY_PERMISSIONS, PERMISSION_GROUPS, type PermissionKey, isFullAccessRole } from '@/lib/auth/permissions';

type User = {
  id: string;
  email: string;
  full_name: string;
  role: AuthRole;
  is_active: boolean;
  cms_permissions: PermissionKey[] | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_OPTIONS: Array<{ value: AuthRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'president', label: 'President' },
  { value: 'secretary', label: 'Secretary' },
  { value: 'vice_president', label: 'Vice President' },
  { value: 'treasurer', label: 'Treasurer' },
  { value: 'committee', label: 'Committee' },
  { value: 'fantasy_manager', label: 'Fantasy Manager' },
  { value: 'fantasy_support', label: 'Fantasy Support' },
];

function roleLabel(role: AuthRole) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
}

function permissionsForRole(role: AuthRole) {
  if (role === 'fantasy_support') {
    return PERMISSION_GROUPS
      .map((group) => ({ ...group, permissions: group.permissions.filter(({ key }) => FANTASY_PERMISSIONS.includes(key)) }))
      .filter((group) => group.permissions.length > 0);
  }
  if (role === 'committee') return PERMISSION_GROUPS;
  return [];
}

function PermissionChecklist({
  role,
  selected,
  onChange,
}: {
  role: AuthRole;
  selected: PermissionKey[];
  onChange: (permissions: PermissionKey[]) => void;
}) {
  const groups = permissionsForRole(role);
  if (isFullAccessRole(role)) {
    return <p className="text-sm font-medium text-content-secondary">Full CMS access</p>;
  }
  if (role === 'fantasy_manager') {
    return <p className="text-sm font-medium text-content-secondary">All Fantasy modules</p>;
  }
  if (groups.length === 0) return null;

  const toggle = (permission: PermissionKey) => {
    onChange(selected.includes(permission)
      ? selected.filter((key) => key !== permission)
      : [...selected, permission]);
  };

  return (
    <div className="space-y-4 md:col-span-2" aria-label={`${roleLabel(role)} permissions`}>
      {groups.map((group) => (
        <fieldset key={group.group} className="rounded-lg border border-edge-subtle p-3">
          <legend className="px-1 text-sm font-semibold text-content-primary">{group.group}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.permissions.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm text-content-secondary">
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={() => toggle(key)}
                  className="h-4 w-4 rounded border-edge-strong"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AuthRole>('committee');
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<AuthRole>('committee');
  const [editPermissions, setEditPermissions] = useState<PermissionKey[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [resetPassword, setResetPassword] = useState('');
  const [editingSaving, setEditingSaving] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store', credentials: 'include' });
      const data = await parseApiResponse<{ users?: User[] }>(res);
      setUsers(data.users || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load users.');
    }
  };

  useEffect(() => { void load(); }, []);

  const changeCreateRole = (nextRole: AuthRole) => {
    setRole(nextRole);
    setPermissions([]);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedFullName = fullName.trim();

    if (!trimmedFullName) return setMessage('Full name is required.');
    if (!EMAIL_PATTERN.test(trimmedEmail)) return setMessage('Enter a valid email address.');
    if (!AUTH_ROLES.includes(role)) return setMessage('Select a valid role.');
    if (password.length < 10) return setMessage('Temporary password must be at least 10 characters.');

    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: trimmedEmail, fullName: trimmedFullName, password, role, permissions }),
      });
      await parseApiResponse(res);
      setEmail('');
      setFullName('');
      setPassword('');
      setRole('committee');
      setPermissions([]);
      setMessage('User created.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  const openEditor = (user: User) => {
    setEditingId(user.id);
    setEditEmail(user.email);
    setEditFullName(user.full_name);
    setEditRole(user.role);
    setEditPermissions(user.role === 'committee' || user.role === 'fantasy_support' ? user.cms_permissions || [] : []);
    setEditActive(user.is_active);
    setResetPassword('');
    setMessage('');
  };

  const changeEditRole = (nextRole: AuthRole) => {
    setEditRole(nextRole);
    setEditPermissions([]);
  };

  const saveAccess = async () => {
    if (!editingId) return;
    const trimmedEmail = editEmail.trim();
    const trimmedFullName = editFullName.trim();
    if (!trimmedFullName) return setMessage('Full name is required.');
    if (!EMAIL_PATTERN.test(trimmedEmail)) return setMessage('Enter a valid email address.');

    setEditingSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: editingId,
          email: trimmedEmail,
          fullName: trimmedFullName,
          role: editRole,
          isActive: editActive,
          permissions: editPermissions,
        }),
      });
      await parseApiResponse(res);
      setMessage('User access updated. Existing sessions were revoked.');
      setEditingId(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update user access.');
    } finally {
      setEditingSaving(false);
    }
  };

  const resetUserPassword = async () => {
    if (!editingId) return;
    if (resetPassword.length < 10) return setMessage('Reset password must be at least 10 characters.');

    setEditingSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: editingId, resetPassword }),
      });
      await parseApiResponse(res);
      setResetPassword('');
      setMessage('Password reset. Existing sessions were revoked.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to reset password.');
    } finally {
      setEditingSaving(false);
    }
  };

  const toggleActive = async (user: User) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: user.id, isActive: !user.is_active }),
      });
      await parseApiResponse(res);
      setMessage(`User ${user.is_active ? 'deactivated' : 'activated'}. Existing sessions were revoked.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update user.');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">CMS Users</h1>
      {message && <p className="text-sm text-content-muted" role="status">{message}</p>}

      <form onSubmit={create} className="bg-surface-card p-4 rounded-xl border grid md:grid-cols-2 gap-3">
        <Input id="full-name" label="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        <Input id="email" type="email" label="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <PasswordInput id="password" label="Temporary password (minimum 10 characters)" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required />
        <label className="text-sm font-medium text-content-secondary">Role
          <select className="mt-1 w-full border border-edge-strong rounded-lg px-3 py-2 bg-surface-card" value={role} onChange={(event) => changeCreateRole(event.target.value as AuthRole)}>
            {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <PermissionChecklist role={role} selected={permissions} onChange={setPermissions} />
        <div className="md:col-span-2"><Button type="submit" isLoading={saving}>Create User</Button></div>
      </form>

      <div className="bg-surface-card rounded-xl border divide-y">
        {users.map((user) => (
          <div key={user.id} className="p-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{user.full_name}</p>
                <p className="text-sm text-content-muted">{user.email} · {roleLabel(user.role)} · {user.is_active ? 'Active' : 'Inactive'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => openEditor(user)}>Manage Access</Button>
                <Button type="button" variant="secondary" onClick={() => void toggleActive(user)}>{user.is_active ? 'Deactivate' : 'Activate'}</Button>
              </div>
            </div>

            {editingId === user.id && (
              <div className="rounded-lg border border-edge-subtle bg-surface-muted p-4 grid gap-3 md:grid-cols-2">
                <Input id={`edit-name-${user.id}`} label="Full name" value={editFullName} onChange={(event) => setEditFullName(event.target.value)} required />
                <Input id={`edit-email-${user.id}`} type="email" label="Email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} required />
                <label className="text-sm font-medium text-content-secondary">Role
                  <select className="mt-1 w-full border border-edge-strong rounded-lg px-3 py-2 bg-surface-card" value={editRole} onChange={(event) => changeEditRole(event.target.value as AuthRole)}>
                    {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-content-secondary">
                  <input type="checkbox" checked={editActive} onChange={(event) => setEditActive(event.target.checked)} className="h-4 w-4 rounded border-edge-strong" />
                  Active
                </label>
                <PermissionChecklist role={editRole} selected={editPermissions} onChange={setEditPermissions} />
                <div className="md:col-span-2 flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void saveAccess()} isLoading={editingSaving}>Save Access</Button>
                  <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
                <div className="md:col-span-2 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end border-t border-edge-subtle pt-4">
                  <PasswordInput id={`reset-password-${user.id}`} label="Reset password (minimum 10 characters)" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} minLength={10} />
                  <Button type="button" variant="secondary" onClick={() => void resetUserPassword()} isLoading={editingSaving}>Reset Password</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
