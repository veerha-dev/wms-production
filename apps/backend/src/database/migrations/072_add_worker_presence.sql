-- Migration: 072_add_worker_presence
-- Description: Per PDF §5.1 Worker Activity Panel — each worker card shows Active / Idle / On Break.
--              Drives the manager dashboard's live worker activity view. Updated by Socket.IO heartbeat.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS presence_status TEXT NOT NULL DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP;

COMMENT ON COLUMN users.presence_status IS
  'Real-time presence: active | idle | break | offline. Auto-mark idle after 5 min without heartbeat.';
COMMENT ON COLUMN users.last_heartbeat_at IS
  'Last time the worker app pinged. Used by background sweep to flip stale active sessions to idle.';

CREATE INDEX IF NOT EXISTS idx_users_presence ON users(presence_status);
CREATE INDEX IF NOT EXISTS idx_users_heartbeat ON users(last_heartbeat_at);
