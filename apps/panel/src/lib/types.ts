export interface User {
  id: number;
  username: string;
  role: 'admin' | 'member';
  is_active: number;
  created_at: string;
  created_by?: number;
}

export interface ApiToken {
  id: number;
  prefix: string;
  created_at: string;
  created_by?: number;
  last_used_at?: string;
}

export interface SessionPayload {
  userId: number;
  role: string;
  /** The auth_sessions row id the access token is bound to (stable across rotations). */
  sid?: string;
}

/**
 * Public shape of one device session as returned by GET /api/admin/auth/sessions
 * (UI-1). Hash/lineage columns are never exposed by the server.
 */
export interface AdminSession {
  id: string;
  device_name: string | null;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  revoked_at: string | null;
  status: 'active' | 'expired' | 'revoked';
}

export type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface InstanceSettings {
  registration_enabled: boolean;
  [key: string]: string | boolean | number | undefined;
}
