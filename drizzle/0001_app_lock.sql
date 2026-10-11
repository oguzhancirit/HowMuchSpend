CREATE TABLE app_lock_devices (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  credential TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  origin TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE app_lock_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  challenge TEXT NOT NULL,
  origin TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
