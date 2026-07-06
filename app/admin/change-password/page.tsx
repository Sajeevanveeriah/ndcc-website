'use client';

import { useState } from 'react';
import { PasswordInput } from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { parseApiResponse } from '@/lib/admin-client';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setSaving(true);

    try {
      const res = await fetch('/api/admin/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      await parseApiResponse(res);
      setMessage('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-display font-bold mb-4">Change Password</h1>
      <form onSubmit={onSubmit} className="space-y-4 bg-white p-6 rounded-xl border border-gray-200">
        <PasswordInput id="current" label="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        <PasswordInput id="next" label="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        <Button type="submit" isLoading={saving}>Update Password</Button>
        {message && <p className="text-sm text-gray-600">{message}</p>}
      </form>
    </div>
  );
}
