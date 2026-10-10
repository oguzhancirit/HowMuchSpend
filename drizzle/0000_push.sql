CREATE TABLE push_devices (
  id TEXT PRIMARY KEY NOT NULL,
  subscription TEXT NOT NULL,
  rules TEXT NOT NULL,
  lead_days INTEGER NOT NULL DEFAULT 1,
  details INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  last_test_at INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE push_deliveries (
  device_id TEXT NOT NULL REFERENCES push_devices(id),
  occurrence_key TEXT NOT NULL,
  lead_days INTEGER NOT NULL,
  state TEXT NOT NULL,
  claim TEXT NOT NULL,
  claim_until INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  last_error TEXT,
  PRIMARY KEY (device_id, occurrence_key, lead_days)
);
--> statement-breakpoint
CREATE TABLE push_state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
