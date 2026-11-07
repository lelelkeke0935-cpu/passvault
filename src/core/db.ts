import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type DB = Database.Database;

// sandbox_log belongs to src/sandbox (it creates its own table); we only clear it on reset.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('password','api_key','document','photo')),
  name_enc BLOB NOT NULL,
  wrapped_key BLOB NOT NULL,
  value_enc BLOB,
  blob_key TEXT,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS grants (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  secret_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  token TEXT NOT NULL,
  req_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  allowed_at TEXT,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS proxy_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  at TEXT NOT NULL,
  agent TEXT NOT NULL,
  secret TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT,
  grant_id TEXT,
  prev_hash TEXT,
  hash TEXT
);
CREATE TABLE IF NOT EXISTS mcp_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  agent TEXT NOT NULL,
  caption TEXT,
  content TEXT NOT NULL
);
`;

export function openDb(dataDir: string): DB {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, 'vault.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 3000');
  db.exec(SCHEMA);
  return db;
}

export function getSetting(db: DB, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(db: DB, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function now(): string {
  return new Date().toISOString();
}
