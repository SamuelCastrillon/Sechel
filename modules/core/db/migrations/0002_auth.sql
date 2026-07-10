-- CortextMCP Slice 3 auth schema: user_tokens, instance_settings, users.is_active.
-- Idempotent: every object uses IF NOT EXISTS / column existence check.

CREATE TABLE IF NOT EXISTS user_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   TEXT NOT NULL,
  user_id     INTEGER NOT NULL,
  prefix      TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  description TEXT,
  last_used_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_tokens_hash ON user_tokens(token_hash);

CREATE TABLE IF NOT EXISTS instance_settings (
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (key)
);

ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0;
