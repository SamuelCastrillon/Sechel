import { useState } from 'react';
import { listSessions, revokeSession } from '@/lib/api-client';
import type { AdminSession } from '@/lib/types';

const STATUS_STYLES: Record<AdminSession['status'], string> = {
  active: 'text-green-400 border-green-900',
  expired: 'text-muted-foreground border-outline-variant',
  revoked: 'text-red-400 border-red-800',
};

function shortUserAgent(ua: string | null): string {
  if (!ua) return '—';
  return ua.length > 48 ? `${ua.slice(0, 48)}…` : ua;
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  return new Date(value + 'Z').toLocaleString();
}

/**
 * Sessions list (UI-1/UI-2). Server-rendered with `initialSessions` and
 * hydrated on the client: revoking a device calls revokeSession(id) through
 * the api-client (single-flight 401 → refresh → retry) and then re-fetches
 * the list so the row flips to revoked and other devices stay untouched.
 * Device-name editing is deliberately NOT included (UI-4 non-goal).
 */
export function SessionsList({
  initialSessions,
  currentSessionId,
}: {
  initialSessions: AdminSession[];
  currentSessionId?: string | null;
}) {
  const [sessions, setSessions] = useState<AdminSession[]>(initialSessions);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleRevoke = async (sessionId: string) => {
    if (!window.confirm('Revoke this session? The device will be signed out immediately.')) {
      return;
    }
    setRevokingId(sessionId);
    setError(null);
    try {
      await revokeSession(sessionId);
      // Re-fetch so the revoked state is visible within seconds (UI-2) and
      // other devices are untouched. If this was the current device, the
      // fetch 401s → api-client redirects to login (session ended gracefully).
      setSessions(await listSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke session');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-4 py-2 bg-destructive/10 border border-destructive/30">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <div className="border border-outline-variant bg-card">
        <div className="border-b border-outline-variant px-4 py-2 bg-[#131313]">
          <p className="text-[10px] font-mono text-on-primary-container tracking-wider">
            [SESSIONS] {sessions.length} TOTAL
          </p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-outline border-b border-outline-variant">
              <th className="px-4 py-2">Device</th>
              <th className="px-4 py-2">User Agent</th>
              <th className="px-4 py-2">IP</th>
              <th className="px-4 py-2">Last Used</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/50">
            {sessions.map((s) => (
              <tr key={s.id} className="align-top">
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-primary">{s.device_name ?? 'web'}</span>
                  {s.id === currentSessionId && (
                    <span className="ml-2 text-[9px] font-bold uppercase tracking-widest text-outline border border-outline-variant px-1.5 py-0.5">
                      This device
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground font-mono" title={s.user_agent ?? undefined}>
                  {shortUserAgent(s.user_agent)}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{s.ip ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatTimestamp(s.last_used_at)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider border px-2 py-0.5 ${
                      STATUS_STYLES[s.status] ?? STATUS_STYLES.active
                    }`}
                  >
                    {s.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {s.status === 'active' ? (
                    <button
                      onClick={() => handleRevoke(s.id)}
                      disabled={revokingId === s.id}
                      className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 border border-red-800 text-red-400 hover:bg-red-950/50 transition-colors disabled:opacity-50 shrink-0"
                    >
                      {revokingId === s.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  ) : (
                    <span className="text-[10px] text-outline-variant">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sessions.length === 0 && (
          <p className="px-4 py-8 text-center text-muted-foreground text-xs">
            No sessions found.
          </p>
        )}
      </div>
    </div>
  );
}
