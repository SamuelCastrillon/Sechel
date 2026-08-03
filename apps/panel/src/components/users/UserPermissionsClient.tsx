import { useState } from 'react';
import { setUserPermission } from '@/lib/api-client';

interface Permission {
  id: number;
  project: string;
  permission: string;
  granted_by: number | null;
  created_at: string;
}

export function UserPermissionsClient({
  userId,
  initialPermissions = [],
}: {
  userId: number;
  initialPermissions?: Permission[];
}) {
  const [permissions, setPermissions] = useState<Permission[]>(initialPermissions);
  const [newProject, setNewProject] = useState('');
  const [newPermission, setNewPermission] = useState('read');
  const [error, setError] = useState<string | null>(null);

  const handleAddOrUpdate = async (project: string, permission: string) => {
    try {
      await setUserPermission(userId, project, permission);
      setError(null);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permission');
    }
  };

  const handleRemove = async (project: string) => {
    try {
      await setUserPermission(userId, project, 'none');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove permission');
    }
  };

  return (
    <div className="border border-outline-variant bg-card">
      <div className="border-b border-outline-variant px-4 py-2 bg-[#131313]">
        <p className="text-[10px] font-mono text-on-primary-container tracking-wider">
          [PERMISSIONS] PROJECT ACCESS — {permissions.length} ASSIGNMENTS
        </p>
      </div>

      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/30">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Existing Permissions */}
      <div className="divide-y divide-outline-variant/50">
        {permissions.map((perm) => (
          <div key={perm.id} className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-foreground">{perm.project}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
                perm.permission === 'write'
                  ? 'border-green-800 text-green-400'
                  : perm.permission === 'read'
                  ? 'border-blue-800 text-blue-400'
                  : 'border-outline-variant text-muted-foreground'
              }`}>
                {perm.permission.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={perm.permission}
                onChange={(e) => handleAddOrUpdate(perm.project, e.target.value)}
                className="bg-[#0c0c0c] border border-outline-variant text-on-surface text-xs px-2 py-1 focus:outline-none focus:border-primary"
              >
                <option value="read">read</option>
                <option value="write">write</option>
              </select>
              <button
                onClick={() => handleRemove(perm.project)}
                className="text-[10px] font-bold uppercase px-2 py-1 border border-red-800 text-red-400 hover:bg-red-950/50 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add New Permission */}
      <div className="border-t border-outline-variant/50 px-4 py-3 flex items-center gap-3">
        <input
          type="text"
          value={newProject}
          onChange={(e) => setNewProject(e.target.value)}
          placeholder="Project name"
          className="bg-[#0c0c0c] border border-outline-variant text-on-surface text-sm px-3 py-1.5 placeholder:text-surface-variant focus:outline-none focus:border-primary flex-1 max-w-xs"
        />
        <select
          value={newPermission}
          onChange={(e) => setNewPermission(e.target.value)}
          className="bg-[#0c0c0c] border border-outline-variant text-on-surface text-xs px-2 py-1.5 focus:outline-none focus:border-primary"
        >
          <option value="read">read</option>
          <option value="write">write</option>
        </select>
        <button
          onClick={() => {
            if (newProject.trim()) {
              handleAddOrUpdate(newProject.trim(), newPermission);
            }
          }}
          className="bg-primary text-white font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 transition-all hover:bg-opacity-90"
        >
          Add
        </button>
      </div>

      {permissions.length === 0 && (
        <p className="px-4 py-4 text-center text-muted-foreground text-xs">
          No project permissions assigned. Add one above.
        </p>
      )}
    </div>
  );
}
