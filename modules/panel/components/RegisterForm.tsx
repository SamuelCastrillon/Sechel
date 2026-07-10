'use client';

import { useActionState, useState } from 'react';
import { registerAction } from '@/modules/panel/actions/auth';
import { MemoryChipIcon } from './MemoryChipIcon';

export function RegisterForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(registerAction, null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  if (!enabled) {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <MemoryChipIcon className="w-12 h-12" />
        <div className="w-full border border-outline-variant bg-card p-6">
          <p className="text-sm text-muted-foreground text-center">
            Registration is currently disabled.
          </p>
        </div>
      </div>
    );
  }

  if (state?.success) {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <MemoryChipIcon className="w-12 h-12" />
        <div className="w-full border border-outline-variant bg-card p-6 text-center space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Account Created</h2>
          <p className="text-sm text-muted-foreground">
            Your account has been created and is pending activation.
          </p>
          <a href="/admin/login" className="text-sm text-primary hover:underline">Sign In</a>
        </div>
      </div>
    );
  }

  const handleSubmit = (formData: FormData) => {
    const password = formData.get('password') as string;
    const confirm = formData.get('confirmPassword') as string;
    if (password !== confirm) {
      setConfirmError('Passwords do not match');
      return;
    }
    setConfirmError(null);
    action(formData);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm">
      <MemoryChipIcon className="w-12 h-12" />
      <div className="w-full border border-outline-variant bg-card p-6">
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium text-foreground">Username</label>
            <input id="username" name="username" type="text" required
              className="flex h-9 w-full border border-outline-variant bg-surface px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
            <input id="email" name="email" type="email" required
              className="flex h-9 w-full border border-outline-variant bg-surface px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
            <input id="password" name="password" type="password" required
              className="flex h-9 w-full border border-outline-variant bg-surface px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">Confirm Password</label>
            <input id="confirmPassword" name="confirmPassword" type="password" required
              className="flex h-9 w-full border border-outline-variant bg-surface px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          {confirmError && (
            <p className="text-sm text-destructive">{confirmError}</p>
          )}
          {state?.error && !confirmError && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <button type="submit" disabled={pending}
            className="inline-flex items-center justify-center h-9 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed w-full"
          >
            {pending ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <a href="/admin/login" className="text-primary hover:underline">Sign In</a>
        </p>
      </div>
    </div>
  );
}
