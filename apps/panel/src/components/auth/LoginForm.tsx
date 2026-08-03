import { useState, type FormEvent } from 'react';
import { login } from '@/lib/api-client';
import { MemoryChipIcon } from '../MemoryChipIcon';

function EmailIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 4L12 13L2 4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <circle cx="12" cy="16" r="1" />
      <path d="M8 11V7a4 4 0 118 0v4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="M15 18l6-6" />
      <path d="M15 6l6 6" />
    </svg>
  );
}

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    try {
      await login(username, password);
      window.location.href = '/admin';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="w-full max-w-md z-10">
      <div className="border border-outline-variant bg-[#15121a] flex flex-col items-center p-8 md:p-12">
        {/* Logo & Title */}
        <div className="mb-10 text-center">
          <div className="inline-block mb-6">
            <MemoryChipIcon className="w-24 h-24 text-primary" />
          </div>
          <h1 className="text-2xl font-black tracking-tighter text-on-surface uppercase">
            Sechel Admin
          </h1>
          <p className="text-xs font-mono text-outline uppercase tracking-widest mt-2">
            System Access Authorization
          </p>
        </div>

        {/* Status Bar */}
        <div className="w-full mb-8 bg-[#131313] border-l-2 border-[#5b21b6] p-3">
          <p className="text-[10px] font-mono text-on-primary-container leading-tight">
            [STATUS] ENCRYPTED CONNECTION ESTABLISHED<br />
            [ACTION] ENTER CREDENTIALS TO INITIALIZE SESSION
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-6">
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-[10px] font-bold uppercase tracking-widest text-outline ml-1">
              Root Identifier
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-outline">
                <EmailIcon />
              </span>
              <input
                id="username"
                name="username"
                type="text"
                required
                placeholder="name@sechel.io"
                className="w-full bg-[#0c0c0c] border border-outline-variant text-on-surface text-sm pl-10 py-3 placeholder:text-surface-variant focus:outline-none focus:border-[#5b21b6] focus:shadow-[0_0_0_1px_#5b21b6]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest text-outline ml-1">
              Access Key
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-outline">
                <LockIcon />
              </span>
              <input
                id="password"
                name="password"
                type="password"
                required
                placeholder="••••••••"
                className="w-full bg-[#0c0c0c] border border-outline-variant text-on-surface text-sm pl-10 py-3 placeholder:text-surface-variant focus:outline-none focus:border-[#5b21b6] focus:shadow-[0_0_0_1px_#5b21b6]"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-[#5b21b6] text-white font-bold text-sm uppercase tracking-[0.2em] py-4 transition-all duration-150 active:scale-[0.98] hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
          >
            {pending ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                VALIDATING...
              </>
            ) : (
              <>
                Initialize Sign In
                <ArrowIcon />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-10 pt-8 border-t border-outline-variant w-full flex flex-col gap-4 text-center">
          <a href="/admin/register" className="text-[11px] font-mono text-primary uppercase tracking-widest hover:underline decoration-1 underline-offset-4">
            Initialize New Account? Register
          </a>
          <span className="text-[10px] text-on-surface-variant">
            Terminal Manual &amp; Privacy Protocol
          </span>
        </div>
      </div>

      {/* Technical Metadata */}
      <div className="mt-6 flex justify-between text-[9px] font-mono text-outline-variant uppercase tracking-tighter px-2">
        <span>Server: local-node-04</span>
        <span>Uptime: 99.982%</span>
        <span>v2.4.1-STABLE</span>
      </div>
    </main>
  );
}
