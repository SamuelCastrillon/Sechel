'use client';

import { useActionState } from 'react';
import { createUser } from '@/modules/panel/actions/users';

type FormState = { error: string } | null;

async function createUserAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const username = formData.get('username') as string;
  const role = formData.get('role') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { error: 'Username and password are required' };
  }

  const result = await createUser(username, role, password);
  if (!result.success) {
    return { error: result.error };
  }

  return null;
}

export function UserForm() {
  const [state, formAction, pending] = useActionState(createUserAction, null);

  // If success, clear the form and notify parent
  if (state === null && !pending) {
    // state being null after submission means success
    // The form will reset since useActionState returns null
  }

  return (
    <div className="border border-outline-variant bg-card">
      <div className="border-b border-outline-variant px-4 py-2 bg-[#131313]">
        <p className="text-[10px] font-mono text-on-primary-container tracking-wider">
          [ACTION] CREATE NEW USER
        </p>
      </div>

      <form action={formAction} className="p-4 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="username" className="text-[10px] font-bold uppercase tracking-widest text-outline ml-1">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            required
            placeholder="Enter username"
            className="w-full bg-[#0c0c0c] border border-outline-variant text-on-surface text-sm px-3 py-2 placeholder:text-surface-variant focus:outline-none focus:border-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest text-outline ml-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            placeholder="Set initial password"
            className="w-full bg-[#0c0c0c] border border-outline-variant text-on-surface text-sm px-3 py-2 placeholder:text-surface-variant focus:outline-none focus:border-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="role" className="text-[10px] font-bold uppercase tracking-widest text-outline ml-1">
            Role
          </label>
          <select
            id="role"
            name="role"
            required
            className="w-full bg-[#0c0c0c] border border-outline-variant text-on-surface text-sm px-3 py-2 focus:outline-none focus:border-primary"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-primary text-white font-bold text-xs uppercase tracking-[0.2em] py-3 transition-all duration-150 active:scale-[0.98] hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? 'CREATING...' : 'CREATE USER'}
        </button>
      </form>
    </div>
  );
}
