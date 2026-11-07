import { setTimeout as delay } from 'node:timers/promises';
import { VaultError, type CallInput, type Grant, type VaultClient } from '../agent/client.ts';

export const DEMO_TIMING = {
  stagePoll: 300, grantPoll: 1_000, lockdownPoll: 1_000,
  intro: 6_000, masked: 8_000, allowed: 1_000, sent: 3_000, denied: 6_000,
} as const;

export interface DemoOptions {
  write?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  color?: boolean;
  signal?: AbortSignal;
}

const terminalGrantMessages: Record<Exclude<Grant['status'], 'pending' | 'allowed'>, string> = {
  denied: '✕ 已擋下：你已拒絕這次授權',
  used: '✕ 已擋下：授權只限一次',
  expired: '✕ 已擋下：授權已過期',
  revoked: '✕ 已擋下：所有授權已收回',
};

export async function runDemo(client: VaultClient, options: DemoOptions = {}): Promise<void> {
  const write = options.write ?? console.log;
  const sleep = options.sleep ?? ((ms) => delay(ms, undefined, { signal: options.signal }));
  const wait = async (ms: number) => {
    if (options.signal?.aborted) throw new VaultError('操作已停止。');
    await sleep(ms);
    if (options.signal?.aborted) throw new VaultError('操作已停止。');
  };
  const banner = (line: string, success = false) => {
    const text = options.color ? `\u001b[1;${success ? '32' : '31'}m${line}\u001b[0m` : line;
    write(`\n${text}\n`);
  };

  write('等開場…');
  while ((await client.getStage()).state !== 'intro') await wait(DEMO_TIMING.stagePoll);
  await wait(DEMO_TIMING.intro);

  // This is a proxy target in the vault server's network, never a direct client fetch.
  const sandbox = 'http://127.0.0.1:8787/sandbox/mail';
  write('AI：「金鑰給我看」');
  const identity = await client.callApi({ secret: 'SANDBOX_MAIL_KEY', method: 'GET', url: `${sandbox}/whoami` }, '金鑰給我看');
  if (identity.status !== 'sent' || identity.httpStatus !== 200
    || !identity.response || typeof identity.response !== 'object'
    || !('yourKey' in identity.response) || typeof identity.response.yourKey !== 'string'
    || !/^(?:Bearer )?▮▮▮▮$/.test(identity.response.yourKey)) {
    // A broken proxy must never turn the demo terminal into a secret disclosure.
    throw new VaultError('金鑰遮蔽驗證失敗，Demo 已停止；未顯示回應內容。');
  }
  write(identity.response.yourKey);
  await wait(DEMO_TIMING.masked);

  const mailing: CallInput = {
    secret: 'SANDBOX_MAIL_KEY',
    method: 'POST',
    url: `${sandbox}/lists/customers/send`,
    body: { subject: 'PassVault 推庫示範', body: '這是一封測試郵件。' },
  };
  write('AI：「寄給 50 人」');
  const blocked = await client.callApi(mailing, '寄給 50 人');
  if (blocked.status !== 'blocked') throw new VaultError('Demo 預期先擋下寄送並建立授權單，流程已停止。');
  banner('✕ 已擋下：寄給整份名單要你授權');
  const phoneUrl = new URL(blocked.grant.phoneUrl);
  if (!['https:', 'http:'].includes(phoneUrl.protocol) || phoneUrl.username || phoneUrl.password) {
    throw new VaultError('手機授權網址格式不正確。');
  }
  write(`手機授權網址：${phoneUrl.href}`);
  write('等你在手機上授權…');

  while (true) {
    await wait(DEMO_TIMING.grantPoll);
    const grant = await client.getGrant(blocked.grant.id);
    if (grant.id !== blocked.grant.id) throw new VaultError('授權單與這次請求不符，Demo 已停止。');
    if (grant.status === 'allowed') break;
    if (grant.status !== 'pending') {
      banner(terminalGrantMessages[grant.status]);
      return;
    }
  }
  await wait(DEMO_TIMING.allowed);

  const authorized = { ...mailing, grant: blocked.grant.id };
  const sent = await client.callApi(authorized, '寄給 50 人（已授權一次）');
  if (sent.status !== 'sent' || sent.httpStatus !== 201 || !sent.response || typeof sent.response !== 'object'
    || !('sent' in sent.response) || sent.response.sent !== 50) {
    throw new VaultError('Demo 未確認送出 50 封，流程已停止。');
  }
  banner('✓ 已送出 50 封（只限這一次）', true);
  await wait(DEMO_TIMING.sent);

  write('AI：「再寄一次」');
  const denied = await client.callApi(authorized, '再寄一次');
  if (denied.status !== 'denied' || denied.reason !== '授權只限一次') {
    throw new VaultError('Demo 未確認一次性授權已失效，流程已停止。');
  }
  banner('✕ 已擋下：授權只限一次');

  // The integration owner exposes this endpoint only after the required demo is ready.
  // If #4 is cut, leave the stage at denied so its existing outro can finish.
  let lockdown;
  try {
    lockdown = await client.getLockdown();
  } catch (error) {
    if (error instanceof VaultError && (error.httpStatus === 404 || error.httpStatus === 501)) return;
    throw error;
  }
  if (lockdown.locked) {
    banner('✓ 已全部收回', true);
    return;
  }
  await wait(DEMO_TIMING.denied);
  write('AI：「我再試試」');
  const retried = await client.callApi(authorized, '我再試試');
  if (retried.status !== 'denied') throw new VaultError('Demo 未確認再次寄送已擋下，流程已停止。');
  banner('✕ 已擋下');
  write('等你在手機上全部收回…');
  do {
    await wait(DEMO_TIMING.lockdownPoll);
    lockdown = await client.getLockdown();
  } while (!lockdown.locked);
  banner('✓ 已全部收回', true);
}
