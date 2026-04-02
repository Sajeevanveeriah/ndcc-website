'use client';

import { useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    const res = await fetch('/api/admin/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setMessage(res.ok ? 'Password updated.' : data.error || 'Unable to update password.');
    if (res.ok) {
      setCurrentPassword('');
      setNewPassword('');
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-display font-bold mb-4">Change Password</h1>
      <form onSubmit={onSubmit} className="space-y-4 bg-white p-6 rounded-xl border border-gray-200">
        <Input id="current" type="password" label="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        <Input id="next" type="password" label="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        <Button type="submit">Update Password</Button>
        {message && <p className="text-sm text-gray-600">{message}</p>}
      </form>
    </div>
  );
}
