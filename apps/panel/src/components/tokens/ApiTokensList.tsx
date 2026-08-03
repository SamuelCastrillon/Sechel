import { useState, useCallback } from 'react';
import { listTokens, revokeToken } from '@/lib/api-client';

interface Token {
  id: number;
  prefix: string;
  description: string | null;
  created_at: string;
}

export function ApiTokensList({ initialTokens = [] }: { initialTokens?: Token[] }) {
  const [tokens, setTokens] = useState<Token[]>(initialTokens);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchTokens = useCallback(async () => {
    try {
      const data = await listTokens();
      setTokens(data as unknown as Token[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tokens');
    }
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setCreating(true);
    setRawToken(null);
    try {
      const res = await fetch('/api/admin/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? 'Failed to create token');
      }

      const data = await res.json();
      if (data.raw) {
        setRawToken(data.raw);
      }
      setDescription('');
      await fetchTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
    }
    setCreating(false);
  };

  const handleRevoke = async (tokenId: number) => {
    try {
      await revokeToken(tokenId);
      await fetchTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke token');
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Token Form */}
      <div className="border border-outline-variant bg-card">
        <div className="border-b border-outline-variant px-4 py-2 bg-[#131313]">
          <p className="text-[10px] font-mono text-on-primary-container tracking-wider">
            [ACTION] GENERATE NEW API TOKEN
          </p>
        </div>

        <form onSubmit={handleCreate} className="p-4 space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="description" className="text-[10px] font-bold uppercase tracking-widest text-outline ml-1">
              Description
            </label>
            <input
              id="description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="e.g. ci-deploy"
              className="w-full bg-[#0c0c0c] border border-outline-variant text-on-surface text-sm px-3 py-2 placeholder:text-surface-variant focus:outline-none focus:border-primary"
            />
          </div>

          <button
            type="submit"
            disabled={creating}
            className="w-full bg-primary text-white font-bold text-xs uppercase tracking-[0.2em] py-3 transition-all duration-150 active:scale-[0.98] hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'GENERATING...' : 'GENERATE TOKEN'}
          </button>
        </form>

        {/* Raw token display (shown once) */}
        {rawToken && (
          <div className="mx-4 mb-4 p-3 border border-yellow-800 bg-yellow-950/20">
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-2">
              ⚠ COPY THIS TOKEN NOW — IT WILL NOT BE SHOWN AGAIN
            </p>
            <div className="bg-[#0c0c0c] border border-outline-variant p-2 font-mono text-xs text-on-surface break-all select-all">
              {rawToken}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 bg-destructive/10 border border-destructive/30">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Tokens List */}
      <div className="border border-outline-variant bg-card">
        <div className="border-b border-outline-variant px-4 py-2 bg-[#131313]">
          <p className="text-[10px] font-mono text-on-primary-container tracking-wider">
            [TOKENS] {tokens.length} ACTIVE
          </p>
        </div>

        <div className="divide-y divide-outline-variant/50">
          {tokens.map((token) => (
            <div key={token.id} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-xs text-primary">{token.prefix}...</span>
                  {token.description && (
                    <span className="text-xs text-muted-foreground truncate">{token.description}</span>
                  )}
                </div>
                <p className="text-[9px] font-mono text-outline-variant">
                  Created: {token.created_at ? new Date(token.created_at + 'Z').toLocaleString() : '—'}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(token.id)}
                className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 border border-red-800 text-red-400 hover:bg-red-950/50 transition-colors shrink-0"
              >
                Revoke
              </button>
            </div>
          ))}
          {tokens.length === 0 && (
            <p className="px-4 py-8 text-center text-muted-foreground text-xs">
              No API tokens found. Generate one above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
