export type StageState = 'idle' | 'intro' | 'masked' | 'blocked' | 'allowed' | 'sent' | 'denied' | 'retry' | 'locked';
export interface Grant { id: string; agent: string; secretName: string; summary: string; status: 'pending'|'allowed'|'denied'|'used'|'expired'|'revoked'; createdAt: string; expiresAt: string; phoneUrl: string }
export interface Stage { seq: number; state: StageState; caption: string; blockedCount?: number; allowedCount?: number; grant?: Grant }
export interface Item { id: string; type: 'password'|'api_key'|'document'|'photo'; name: string; size: number; createdAt: string }
export interface ProxyLog {id: string; at: string; agent: string; secret: string; method: string; url: string; outcome: 'sent'|'blocked'|'denied'; reason?: string; grantId?: string}
export interface Evidence {keyGivenToAi: false; sent: number; blocked: number; denied: number; recent: ProxyLog[]}
export interface Remote {state: StageState; locked?: boolean; grant?: Grant}
export interface Usage {used: number; quota: number; store: 'wasabi'|'local'}
export interface Verify {ok: boolean; count: number; head: string; brokenAt?: number}
