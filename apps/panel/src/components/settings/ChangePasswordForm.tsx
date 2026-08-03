import { useState } from 'react';

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? 'Failed to change password');
      }

      setMessage('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    }
    setSaving(false);
  };

  return (
    <div className="border border-outline-variant bg-card">
      <div className="border-b border-outline-variant px-4 py-2 bg-[#131313]">
        <p className="text-[10px] font-mono text-on-primary-container tracking-wider">
          [SECURITY] CHANGE ADMIN PASSWORD
        </p>
      </div>

      {message && (
        <div className="px-4 py-2 bg-green-950/30 border-b border-green-800/30">
          <p className="text-xs text-green-400">{message}</p>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/30">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-outline mb-1 block">
            Current Password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
            required
            className="w-full bg-[#0c0c0c] border border-outline-variant text-on-surface text-sm px-3 py-1.5 placeholder:text-surface-variant focus:outline-none focus:border-primary font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-outline mb-1 block">
            New Password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password (min 6 chars)"
            required
            minLength={6}
            className="w-full bg-[#0c0c0c] border border-outline-variant text-on-surface text-sm px-3 py-1.5 placeholder:text-surface-variant focus:outline-none focus:border-primary font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-outline mb-1 block">
            Confirm New Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            required
            minLength={6}
            className="w-full bg-[#0c0c0c] border border-outline-variant text-on-surface text-sm px-3 py-1.5 placeholder:text-surface-variant focus:outline-none focus:border-primary font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-primary text-white font-bold text-[10px] uppercase tracking-wider px-4 py-2 transition-all hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'UPDATING...' : 'UPDATE PASSWORD'}
        </button>
      </form>
    </div>
  );
}
