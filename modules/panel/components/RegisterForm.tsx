'use client';

import { useActionState, useState } from 'react';
import { registerAction } from '@/modules/panel/actions/auth';
import { MemoryChipIcon } from './MemoryChipIcon';

type RegisterState = { success: boolean; error?: never } | { success?: never; error: string } | null;

async function registerActionWrapper(
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  try {
    const result = await registerAction(formData);
    return result;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Registration failed' };
  }
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function VerifiedUserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

function InputField({
  id,
  label,
  type,
  placeholder,
  icon,
}: {
  id: string;
  label: string;
  type: string;
  placeholder: string;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant block mb-2">
        {label}
      </label>
      <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant pointer-events-none">
          {icon}
        </span>
        <input
          id={id}
          name={id}
          type={type}
          required
          placeholder={placeholder}
          className="w-full bg-[#0c0c0c] border border-outline-variant text-on-surface text-sm pl-10 py-3 placeholder:text-on-surface-variant/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        />
      </div>
    </div>
  );
}

export function RegisterForm({ enabled }: { enabled: boolean }) {
  const [state, formAction, pending] = useActionState(registerActionWrapper, null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  if (!enabled) {
    return (
      <main className="relative w-full max-w-md z-10">
        <div className="bg-[#15121a] border border-outline-variant p-8 md:p-12">
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 mb-6 border border-outline-variant flex items-center justify-center p-2 bg-[#131313]">
              <MemoryChipIcon className="w-full h-full text-primary" />
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-on-surface mb-1 uppercase">Sechel Admin</h1>
            <p className="text-xs font-mono text-on-surface-variant uppercase tracking-widest">Memory Server Registration</p>
          </div>
          <div className="border border-outline-variant bg-[#0c0c0c] p-6">
            <p className="text-sm text-on-surface-variant text-center font-mono">
              Registration is currently disabled.
            </p>
          </div>
        </div>
        <div className="border-t border-outline-variant bg-[#0c0c0c] px-4 py-2 flex items-center gap-4 text-[10px] font-mono text-on-surface-variant">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            System Online
          </span>
          <span>Lat: 34.0522° N</span>
          <span className="ml-auto">v2.4.0-STABLE</span>
        </div>
      </main>
    );
  }

  if (state?.success) {
    return (
      <main className="relative w-full max-w-md z-10">
        <div className="bg-[#15121a] border border-outline-variant p-8 md:p-12">
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 mb-6 border border-outline-variant flex items-center justify-center p-2 bg-[#131313]">
              <MemoryChipIcon className="w-full h-full text-primary" />
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-on-surface mb-1 uppercase">Sechel Admin</h1>
            <p className="text-xs font-mono text-on-surface-variant uppercase tracking-widest">Memory Server Registration</p>
          </div>
          <div className="border border-outline-variant bg-[#0c0c0c] p-6 text-center space-y-3">
            <VerifiedUserIcon className="w-10 h-10 text-green-500 mx-auto" />
            <h2 className="text-lg font-bold text-on-surface uppercase tracking-wider">Account Created</h2>
            <p className="text-sm font-mono text-on-surface-variant">
              Your account has been created and is pending activation.
            </p>
            <a href="/admin/login" className="inline-block mt-2 text-xs font-bold text-primary uppercase tracking-widest hover:underline">
              Sign In
            </a>
          </div>
        </div>
        <div className="border-t border-outline-variant bg-[#0c0c0c] px-4 py-2 flex items-center gap-4 text-[10px] font-mono text-on-surface-variant">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            System Online
          </span>
          <span>Lat: 34.0522° N</span>
          <span className="ml-auto">v2.4.0-STABLE</span>
        </div>
      </main>
    );
  }

  return (
    <main className="relative w-full max-w-md z-10">
      <div className="bg-[#15121a] border border-outline-variant p-8 md:p-12">
        {/* Logo + Title */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 mb-6 border border-outline-variant flex items-center justify-center p-2 bg-[#131313]">
            <MemoryChipIcon className="w-full h-full text-primary" />
          </div>
          <h1 className="text-2xl font-black tracking-tighter text-on-surface mb-1 uppercase">Sechel Admin</h1>
          <p className="text-xs font-mono text-on-surface-variant uppercase tracking-widest">Memory Server Registration</p>
        </div>

        <form
          action={formAction}
          onSubmit={(e) => {
            const formData = new FormData(e.currentTarget);
            const password = formData.get('password') as string;
            const confirm = formData.get('confirmPassword') as string;
            if (password !== confirm) {
              e.preventDefault();
              setConfirmError('Passwords do not match');
            } else {
              setConfirmError(null);
            }
          }}
          className="space-y-6"
        >
          <InputField
            id="username"
            label="Username"
            type="text"
            placeholder="your_username"
            icon={<PersonIcon className="w-4 h-4" />}
          />
          <InputField
            id="email"
            label="Email"
            type="email"
            placeholder="you@example.com"
            icon={<MailIcon className="w-4 h-4" />}
          />
          <InputField
            id="password"
            label="Password"
            type="password"
            placeholder="••••••••"
            icon={<LockIcon className="w-4 h-4" />}
          />
          <InputField
            id="confirmPassword"
            label="Confirm Password"
            type="password"
            placeholder="••••••••"
            icon={<VerifiedUserIcon className="w-4 h-4" />}
          />

          {confirmError && (
            <p className="text-xs font-mono text-red-500">{confirmError}</p>
          )}
          {state?.error && !confirmError && (
            <p className="text-xs font-mono text-red-500">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-[#5b21b6] text-white font-bold py-4 uppercase tracking-[0.2em] text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {pending ? (
              <>
                <SpinnerIcon className="w-4 h-4" />
                Creating Account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs font-mono text-on-surface-variant uppercase tracking-widest">
          Already have an account?{' '}
          <a href="/admin/login" className="text-primary font-bold hover:underline">Sign In</a>
        </p>
      </div>

      {/* Terminal status bar */}
      <div className="border-t border-outline-variant bg-[#0c0c0c] px-4 py-2 flex items-center gap-4 text-[10px] font-mono text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          System Online
        </span>
        <span>Lat: 34.0522° N</span>
        <span className="ml-auto">v2.4.0-STABLE</span>
      </div>
    </main>
  );
}
