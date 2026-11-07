import type { DB } from './db.ts';
import type { Stage } from './stage.ts';
import type { Vault } from './vault.ts';

export interface Env {
  publicUrl: string;
  port: number;
  agentToken?: string;
  stageToken?: string;
  phoneToken?: string;
}

export interface Ctx {
  db: DB;
  vault: Vault;
  stage: Stage;
  env: Env;
  /** Sends the request the vault makes on the AI's behalf (real HTTP in production, app.request in tests). */
  send: (url: string, init: RequestInit) => Response | Promise<Response>;
}
