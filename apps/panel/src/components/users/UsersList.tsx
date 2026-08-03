import { useState, useCallback } from 'react';
import { listUsers, toggleUserActive, updateUserRole } from '@/lib/api-client';
import type { User } from '@/lib/types';

export function UsersList({ initialUsers = [] }: { initialUsers?: User[] }) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await listUsers();
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    }
  }, []);

  const handleToggleActive = async (userId: number) => {
    try {
      await toggleUserActive(userId);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle user');
    }
  };

  const handleRoleChange = async (userId: number, role: string) => {
    try {
      await updateUserRole(userId, role);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  return (
    <div className="border border-outline-variant bg-card">
      {/* Status Bar */}
      <div className="border-b border-outline-variant px-4 py-2 bg-[#131313]">
        <p className="text-[10px] font-mono text-on-primary-container tracking-wider">
          [USERS] {users.length} REGISTERED{' | '}LAST UPDATED: {new Date().toISOString().slice(0, 19)}
        </p>
      </div>

      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/30">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant text-[10px] font-bold uppercase tracking-widest text-outline">
              <th className="text-left px-4 py-3">ID</th>
              <th className="text-left px-4 py-3">Username</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Active</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-outline-variant/50 hover:bg-surface/50 transition-colors">
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{user.id}</td>
                <td className="px-4 py-3">
                  <a
                    href={`/admin/users/${user.id}`}
                    className="text-primary hover:underline underline-offset-2 decoration-1"
                  >
                    {user.username}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="bg-[#0c0c0c] border border-outline-variant text-on-surface text-xs px-2 py-1 focus:outline-none focus:border-primary"
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleActive(user.id)}
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 border transition-colors ${
                      user.is_active
                        ? 'border-green-800 text-green-400 hover:bg-green-950/50'
                        : 'border-red-800 text-red-400 hover:bg-red-950/50'
                    }`}
                  >
                    {user.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`/admin/users/${user.id}`}
                    className="text-[10px] font-mono text-primary uppercase tracking-wider hover:underline underline-offset-2"
                  >
                    Details
                  </a>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
