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
}

export type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface InstanceSettings {
  registration_enabled: boolean;
  [key: string]: string | boolean | number | undefined;
}
