'use client';

import { useActionState } from 'react';
import { loginAction } from '@/modules/panel/actions/auth';
import { MemoryChipIcon } from './MemoryChipIcon';

async function loginActionWrapper(
  _prevState: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  try {
    await loginAction(formData);
    return null;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Login failed' };
  }
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginActionWrapper, null);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm">
      <MemoryChipIcon className="w-12 h-12" />
      <div className="w-full border border-outline-variant bg-card p-6">
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
            <input
              id="email"
              name="username"
              type="text"
              required
              className="flex h-9 w-full border border-outline-variant bg-surface px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="flex h-9 w-full border border-outline-variant bg-surface px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center h-9 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <a href="/admin/register" className="text-primary hover:underline">Register</a>
        </p>
      </div>
    </div>
  );
}
