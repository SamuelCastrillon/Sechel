'use server';

import { type Client } from '@libsql/client';
import { withAdmin } from '@/modules/panel/auth';
import type { ActionResult } from '@/modules/panel/auth';
import { ALLOWED_SETTING_KEYS, type AllowedSettingKey } from './settings-constants';

// ── Internal helpers (exported for testability) ──────────────────

export async function getSettingsInternal(client: Client): Promise<unknown[]> {
  const result = await client.execute({
    sql: `SELECT key, value, updated_at FROM instance_settings ORDER BY key`,
  });
  return result.rows.map((r) => ({ ...r }));
}

export async function getSettingInternal(client: Client, key: string): Promise<unknown | null> {
  const result = await client.execute({
    sql: `SELECT key, value, updated_at FROM instance_settings WHERE key = ?`,
    args: [key],
  });
  return result.rows.length > 0 ? { ...(result.rows[0] as Record<string, unknown>) } : null;
}

export async function setSettingInternal(client: Client, key: string, value: string): Promise<void> {
  // Validate key against allowlist
  if (!ALLOWED_SETTING_KEYS.includes(key as AllowedSettingKey)) {
    throw new Error(`Unknown setting key: ${key}`);
  }

  // Upsert: insert or update
  await client.execute({
    sql: `INSERT INTO instance_settings (key, value, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(key)
          DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    args: [key, value],
  });
}

// ── Server Actions ───────────────────────────────────────────────

export async function getSettings(): Promise<ActionResult> {
  return withAdmin((client) => getSettingsInternal(client));
}

export async function setSetting(key: string, value: string): Promise<ActionResult> {
  return withAdmin((client) => setSettingInternal(client, key, value));
}
