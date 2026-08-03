import type { Hono } from 'hono';
import { sql } from 'kysely';
import { hashPassword } from './auth.js';
import { getUser, getDb, requireRole } from './auth-middleware.js';

const VALID_ROLES = ['admin', 'member'];

/**
 * Register user CRUD routes on the given Hono router.
 *
 * Routes:
 *   GET    /users                  — list all users
 *   POST   /users                  — create a new user
 *   PATCH  /users/:id              — update user role
 *   POST   /users/:id/toggle-active — toggle is_active
 *   POST   /users/:id/permissions   — set project permission
 */
export function registerUserRoutes(router: Hono): void {
  // Require admin role for all user management routes
  router.use(requireRole('admin'));

  // GET /users — list all users
  router.get('/users', async (c) => {
    const db = getDb(c);
    const { tenantId } = getUser(c);

    const result = await sql<{
      id: number;
      username: string;
      role: string;
      is_active: number;
      created_at: string;
    }>`
      SELECT id, username, role, is_active, created_at
      FROM users
      WHERE tenant_id = ${tenantId}
      ORDER BY username
    `.execute(db);

    return c.json({ users: result.rows.map((r) => ({ ...r })) });
  });

  // POST /users — create a new user
  router.post('/users', async (c) => {
    const db = getDb(c);
    const { tenantId, userId } = getUser(c);

    let username: string | undefined;
    let password: string | undefined;
    let role: string | undefined;
    try {
      const body = await c.req.json<{ username?: string; password?: string; role?: string }>();
      username = body.username;
      password = body.password;
      role = body.role ?? 'member';
      if (!VALID_ROLES.includes(role)) {
        return c.json({ error: 'role must be admin or member' }, 400);
      }
    } catch {
      return c.json({ error: 'username, password, and role are required' }, 400);
    }

    if (!username || !password || !role) {
      return c.json({ error: 'username, password, and role are required' }, 400);
    }

    // Check for duplicate
    const existing = await sql<{ id: number }>`
      SELECT id FROM users WHERE tenant_id = ${tenantId} AND username = ${username}
    `.execute(db);

    if (existing.rows.length > 0) {
      return c.json({ error: 'Username already exists' }, 409);
    }

    const hash = await hashPassword(password);

    await sql`
      INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_by, created_at)
      VALUES (${tenantId}, ${username}, ${role}, ${hash}, 1, ${userId}, datetime('now'))
    `.execute(db);

    // Retrieve the newly created user
    const created = await sql<{
      id: number; username: string; role: string; is_active: number; created_at: string;
    }>`
      SELECT id, username, role, is_active, created_at
      FROM users
      WHERE tenant_id = ${tenantId} AND username = ${username}
    `.execute(db);

    return c.json({ ...created.rows[0] }, 201);
  });

  // PATCH /users/:id — update user role
  router.patch('/users/:id', async (c) => {
    const db = getDb(c);
    const { tenantId } = getUser(c);
    const id = Number(c.req.param('id'));

    if (isNaN(id)) {
      return c.json({ error: 'Invalid user id' }, 400);
    }

    let role: string | undefined;
    try {
      const body = await c.req.json<{ role?: string }>();
      role = body.role;
    } catch {
      return c.json({ error: 'role is required' }, 400);
    }

    if (!role) {
      return c.json({ error: 'role is required' }, 400);
    }

    if (!VALID_ROLES.includes(role)) {
      return c.json({ error: 'role must be admin or member' }, 400);
    }

    // Check user exists
    const existing = await sql<{ id: number }>`
      SELECT id FROM users WHERE id = ${id} AND tenant_id = ${tenantId}
    `.execute(db);

    if (existing.rows.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    await sql`
      UPDATE users SET role = ${role} WHERE id = ${id} AND tenant_id = ${tenantId}
    `.execute(db);

    const updated = await sql<{
      id: number; username: string; role: string; is_active: number;
    }>`
      SELECT id, username, role, is_active FROM users WHERE id = ${id}
    `.execute(db);

    return c.json({ ...updated.rows[0] });
  });

  // POST /users/:id/toggle-active — toggle is_active
  router.post('/users/:id/toggle-active', async (c) => {
    const db = getDb(c);
    const { tenantId } = getUser(c);
    const id = Number(c.req.param('id'));

    if (isNaN(id)) {
      return c.json({ error: 'Invalid user id' }, 400);
    }

    const result = await sql`
      UPDATE users SET is_active = NOT is_active WHERE id = ${id} AND tenant_id = ${tenantId}
    `.execute(db);

    const affected = Number(result.numAffectedRows ?? 0);
    if (affected === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    const updated = await sql<{
      id: number; username: string; role: string; is_active: number;
    }>`
      SELECT id, username, role, is_active FROM users WHERE id = ${id}
    `.execute(db);

    return c.json({ ...updated.rows[0] });
  });

  // POST /users/:id/permissions — set project permission
  router.post('/users/:id/permissions', async (c) => {
    const db = getDb(c);
    const { tenantId, userId: grantedBy } = getUser(c);
    const id = Number(c.req.param('id'));

    if (isNaN(id)) {
      return c.json({ error: 'Invalid user id' }, 400);
    }

    let project: string | undefined;
    let permission: string | undefined;
    try {
      const body = await c.req.json<{ project?: string; permission?: string }>();
      project = body.project;
      permission = body.permission;
    } catch {
      return c.json({ error: 'project and permission are required' }, 400);
    }

    if (!project || !permission) {
      return c.json({ error: 'project and permission are required' }, 400);
    }

    if (!['read', 'write', 'none'].includes(permission)) {
      return c.json({ error: 'permission must be read, write, or none' }, 400);
    }

    // Check user exists
    const existing = await sql<{ id: number }>`
      SELECT id FROM users WHERE id = ${id} AND tenant_id = ${tenantId}
    `.execute(db);

    if (existing.rows.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    if (permission === 'none') {
      await sql`
        DELETE FROM user_project_access
        WHERE tenant_id = ${tenantId} AND user_id = ${id} AND project = ${project}
      `.execute(db);
    } else {
      await sql`
        INSERT INTO user_project_access (tenant_id, user_id, project, permission, granted_by)
        VALUES (${tenantId}, ${id}, ${project}, ${permission}, ${grantedBy})
        ON CONFLICT(tenant_id, user_id, project)
        DO UPDATE SET permission = excluded.permission, granted_by = excluded.granted_by
      `.execute(db);
    }

    return c.body(null, 204);
  });
}
