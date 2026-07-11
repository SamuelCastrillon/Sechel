import { createClient } from '@libsql/client';
import { resolveUrl, createLibsqlClient, TENANT_ID } from '@/modules/core/db';
import { requireAdmin } from '@/modules/panel/auth';
import { UserPermissionsClient } from './UserPermissionsClient';

interface PermissionRow {
  id: number;
  project: string;
  permission: string;
  granted_by: number | null;
  created_at: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

function rowToPermission(r: Record<string, unknown>): PermissionRow {
  return {
    id: r.id as number,
    project: r.project as string,
    permission: r.permission as string,
    granted_by: r.granted_by as number | null,
    created_at: r.created_at as string,
  };
}

async function fetchUserAndPermissions(userId: number) {
  const client = createLibsqlClient();
  try {
    const users = await client.execute({
      sql: `SELECT id, username, role, is_active, created_by, created_at FROM users WHERE tenant_id = ? AND id = ?`,
      args: [TENANT_ID(), userId],
    });
    const user = users.rows.length > 0 ? (users.rows[0] as Record<string, unknown>) : null;

    if (!user) return { user: null, permissions: [] };

    const perms = await client.execute({
      sql: `SELECT id, project, permission, granted_by, created_at FROM user_project_access WHERE tenant_id = ? AND user_id = ? ORDER BY project`,
      args: [TENANT_ID(), userId],
    });
    const permissions = perms.rows.map((r) => rowToPermission(r as Record<string, unknown>));

    return { user, permissions };
  } finally {
    client.close();
  }
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-foreground">Invalid User</h1>
        <p className="text-muted-foreground">The user ID is invalid.</p>
      </div>
    );
  }

  const { user, permissions } = await fetchUserAndPermissions(userId);
  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-foreground">User Not Found</h1>
        <p className="text-muted-foreground">User with ID {userId} does not exist.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{user.username as string}</h1>
        <p className="text-sm text-muted-foreground mt-1">User details and project permissions.</p>
      </div>

      {/* User Info */}
      <div className="border border-outline-variant bg-card">
        <div className="border-b border-outline-variant px-4 py-2 bg-[#131313]">
          <p className="text-[10px] font-mono text-on-primary-container tracking-wider">
            [INFO] ACCOUNT DETAILS
          </p>
        </div>
        <dl className="p-4 space-y-3 text-sm">
          <div className="flex gap-2">
            <dt className="font-medium text-muted-foreground w-24">ID:</dt>
            <dd className="text-foreground font-mono">{user.id as number}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-muted-foreground w-24">Username:</dt>
            <dd className="text-foreground">{user.username as string}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-muted-foreground w-24">Role:</dt>
            <dd className="text-foreground">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
                user.role === 'admin'
                  ? 'border-purple-800 text-purple-400'
                  : 'border-blue-800 text-blue-400'
              }`}>
                {(user.role as string).toUpperCase()}
              </span>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-muted-foreground w-24">Active:</dt>
            <dd className="text-foreground">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
                user.is_active
                  ? 'border-green-800 text-green-400'
                  : 'border-red-800 text-red-400'
              }`}>
                {(user.is_active ? 'ACTIVE' : 'INACTIVE') as string}
              </span>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-muted-foreground w-24">Created:</dt>
            <dd className="text-foreground text-xs font-mono">
              {user.created_at ? new Date((user.created_at as string) + 'Z').toLocaleString() : '—'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Project Permissions */}
      <UserPermissionsClient userId={userId} initialPermissions={permissions} />
    </div>
  );
}
