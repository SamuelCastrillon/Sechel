import { useState } from 'react';
import { createUser } from '@/lib/api-client';

export function UserForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!username || !password) {
      setError('Username and password are required');
      return;
    }

    setPending(true);
    try {
      await createUser({ username, password, role });
      setUsername('');
      setPassword('');
      setRole('member');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
    setPending(false);
  };

  return (
    <div className="border border-outline-variant bg-card">
      <div className="border-b border-outline-variant px-4 py-2 bg-[#131313]">
        <p className="text-[10px] font-mono text-on-primary-container tracking-wider">
          [ACTION] CREATE NEW USER
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="username" className="text-[10px] font-bold uppercase tracking-widest text-outline ml-1">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            className="w-full bg-[#0c0c0c] border border-outline-variant text-on-surface text-sm px-3 py-2 focus:outline-none focus:border-primary"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {success && (
          <p className="text-sm text-green-400">User created successfully</p>
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
