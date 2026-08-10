-- Sechel auth sessions schema: per-device revocable sessions (AS-1).
-- Idempotent: every object uses IF NOT EXISTS.
-- refresh_hash stores the SHA-256 of the opaque refresh token (plaintext never persisted)
-- The unique index is partial so a revoked session may drop its hash without collisions

CREATE TABLE IF NOT EXISTS auth_sessions (
  id           TEXT NOT NULL,
  tenant_id    TEXT NOT NULL,
  user_id      INTEGER NOT NULL,
  device_name  TEXT,
  user_agent   TEXT,
  ip           TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  refresh_hash TEXT,
  lineage_id   TEXT NOT NULL,
  prev_hash    TEXT,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_lineage ON auth_sessions(lineage_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_sessions_refresh_hash
  ON auth_sessions(refresh_hash)
  WHERE refresh_hash IS NOT NULL;