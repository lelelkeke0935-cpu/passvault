import { type DB, getSetting, now, setSetting } from './db.ts';

// "Take everything back" (#4). Stored in SQLite so a restart keeps the vault locked.

export function lockState(db: DB): { locked: boolean; at?: string } {
  const raw = getSetting(db, 'lockdown');
  return raw ? JSON.parse(raw) : { locked: false };
}

export function isLocked(db: DB): boolean {
  return lockState(db).locked;
}

export function lock(db: DB): { locked: true; at: string } {
  const state = { locked: true as const, at: now() };
  db.transaction(() => {
    setSetting(db, 'lockdown', JSON.stringify(state));
    db.prepare("UPDATE grants SET status = 'revoked' WHERE status IN ('pending', 'allowed')").run();
  })();
  return state;
}

export function unlock(db: DB): { locked: false } {
  setSetting(db, 'lockdown', JSON.stringify({ locked: false }));
  return { locked: false };
}
