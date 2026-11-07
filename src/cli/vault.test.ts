import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startFakeVault, type FakeVault } from '../agent/fake-vault.test-support.ts';
import { runCli } from './vault.ts';
import { runDemo } from './demo.ts';

describe('vault CLI and required demo', () => {
  let fake: FakeVault;
  let output: string[];
  let waits: number[];
  const write = (line: string) => { output.push(line); };
  const sleep = async (ms: number) => { waits.push(ms); };
  beforeEach(async () => { fake = await startFakeVault(); output = []; waits = []; });
  afterEach(async () => { await fake.close(); });

  it('waits for the stage, masks, blocks, waits for permission, sends once and rejects reuse', async () => {
    await runCli(['demo'], { client: fake.client, write, sleep });
    expect(output[0]).toBe('等開場…');
    expect(output.join('\n')).toContain('▮▮▮▮');
    expect(output.join('\n')).toContain('等你在手機上授權…');
    expect(output.join('\n')).toContain(fake.grant.phoneUrl);
    expect(output.join('\n')).toContain('✓ 已送出 50 封（只限這一次）');
    expect(output.join('\n')).toContain('✕ 已擋下：授權只限一次');
    expect(waits).toEqual([300, 300, 6_000, 10_000, 1_000, 1_000, 1_000, 3_000]);
    expect(fake.calls.map((c) => c.caption)).toEqual(['我要你的 API 來完成需求', '寄給 50 人', '寄給 50 人（已授權一次）', '再寄一次']);
    expect(fake.calls.map((c) => c.grant)).toEqual([undefined, undefined, 'g_demo', 'g_demo']);
    expect(fake.calls[1]?.url).toBe('http://127.0.0.1:8787/sandbox/mail/lists/customers/send');
    expect(fake.calls[1]?.body).toEqual(fake.calls[2]?.body);
    expect(fake.calls[2]?.body).toEqual(fake.calls[3]?.body);
    expect(fake.requests.every((r) => r.authenticated && !r.ownerCredential && r.path.startsWith('/api/'))).toBe(true);
    expect(fake.state.sent).toBe(50);
  });

  it.each(['denied', 'expired', 'revoked', 'used'] as const)('stops on a %s grant without attempting the mailing', async (status) => {
    fake.grantStatuses.splice(0, fake.grantStatuses.length, status);
    await runDemo(fake.client, { write, sleep });
    expect(fake.calls).toHaveLength(2);
    expect(fake.state.sent).toBe(0);
    expect(output.at(-1)).toContain('✕ 已擋下');
  });

  it('does not print a secret if the server fails to mask whoami', async () => {
    const unsafe = randomUUID();
    fake.callResults.push({ status: 'sent', httpStatus: 200, response: { yourKey: unsafe } });
    await expect(runDemo(fake.client, { write, sleep })).rejects.toThrow('金鑰遮蔽驗證失敗');
    expect(output.join('\n').includes(unsafe)).toBe(false);
    expect(fake.calls).toHaveLength(1);
  });

  it('does not report 50 sent if the proxy returns a different outcome', async () => {
    fake.callResults.push(
      { status: 'sent', httpStatus: 200, response: { yourKey: '▮▮▮▮' } },
      { status: 'blocked', reason: '寄給整份名單要你授權', grant: fake.grant },
      { status: 'sent', httpStatus: 201, response: { sent: 1 } },
    );
    await expect(runDemo(fake.client, { write, sleep })).rejects.toThrow('未確認送出 50 封');
    expect(output.join('\n')).not.toContain('✓ 已送出 50 封');
    expect(fake.calls).toHaveLength(3);
  });

  it.each([false, true])('resets logs while preserving locked=%s', async (locked) => {
    fake.state.locked = locked;
    await runCli(['demo', '--reset'], { client: fake.client, write });
    expect(fake.state.locked).toBe(locked);
    expect(fake.state.resetCount).toBe(1);
    expect(fake.requests.map((r) => [r.method, r.path])).toEqual([['POST', '/api/demo/reset']]);
    expect(fake.requests[0]?.ownerCredential).toBe(false);
    expect(output[0]).toBe(locked ? '保險箱還鎖著，請在舞台頁按 R 重設並解鎖' : '✓ Demo 已重設');
  });

  it.each(['password', 'api_key'])('adds a %s from stdin without printing it', async (type) => {
    const value = ` ${randomUUID()} `;
    let receivedCorrectly = false;
    fake.onAdd((input) => { receivedCorrectly = input.value === value && input.type === type && input.name === 'example'; });
    await runCli(['add', 'example', '--type', type], {
      client: fake.client, input: Readable.from([value, '\r\n']), inputIsTTY: false, write,
    });
    expect(receivedCorrectly).toBe(true);
    expect(output).toEqual(['✓ 已收進保險箱（已加密）']);
    expect(output.join('\n').includes(value)).toBe(false);
  });

  it('rejects empty input and terminal input before uploading', async () => {
    const args = ['add', 'example', '--type', 'password'];
    await expect(runCli(args, { client: fake.client, inputIsTTY: true, write })).rejects.toThrow('避免終端機顯示');
    await expect(runCli(args, { client: fake.client, input: Readable.from(['\n']), inputIsTTY: false, write })).rejects.toThrow('stdin 沒有內容');
    expect(fake.requests).toHaveLength(0);
  });

  it('lists only metadata and rejects unknown or unlocking commands', async () => {
    await runCli(['list'], { client: fake.client, write });
    expect(JSON.parse(output[0]!)).toEqual(await fake.client.listSecrets());
    await expect(runCli(['unlock'], { client: fake.client, write })).rejects.toThrow('指令格式不正確');
    await expect(runCli(['demo', '--reset', '--unlock'], { client: fake.client, write })).rejects.toThrow('指令格式不正確');
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true);
  });

  it('can stop while waiting for intro without making a proxy call', async () => {
    const controller = new AbortController();
    await expect(runDemo(fake.client, { write, signal: controller.signal, sleep: async () => { controller.abort(); } })).rejects.toThrow('操作已停止');
    expect(fake.calls).toHaveLength(0);
  });

  it('runs the lockdown ending with the documented timing and three blocked attempts', async () => {
    fake.state.lockdownAvailable = true;
    fake.lockdownStates.push(false, false, true);
    await runDemo(fake.client, { write, sleep, color: true });
    expect(fake.calls.map((c) => c.caption)).toEqual(['我要你的 API 來完成需求', '寄給 50 人', '寄給 50 人（已授權一次）', '再寄一次', '我再試試']);
    expect(fake.calls[4]?.grant).toBe('g_demo');
    expect(fake.calls[4]?.body).toEqual(fake.calls[2]?.body);
    expect(waits).toEqual([300, 300, 6_000, 10_000, 1_000, 1_000, 1_000, 3_000, 6_000, 1_000, 1_000]);
    expect(output.join('\n')).toContain('\u001b[1;31m✕ 已擋下');
    expect(output.join('\n')).toContain('等你在手機上全部收回…');
    expect(output.at(-1)).toContain('✓ 已全部收回');
    expect(fake.requests.filter((r) => r.path === '/api/lockdown')).toHaveLength(3);
    expect(fake.requests.every((r) => !r.ownerCredential)).toBe(true);
    expect(fake.state.sent).toBe(50);
  });

  it('accepts a masked authorization header without displaying any unmasked value', async () => {
    fake.callResults.push({ status: 'sent', httpStatus: 200, response: { yourKey: 'Bearer ▮▮▮▮' } });
    await runDemo(fake.client, { write, sleep });
    expect(output).toContain('Bearer ▮▮▮▮');
  });

  it('finishes without another proxy request if the owner has already locked it', async () => {
    fake.state.lockdownAvailable = true;
    fake.lockdownStates.push(true);
    await runDemo(fake.client, { write, sleep });
    expect(fake.calls).toHaveLength(4);
    expect(output.at(-1)).toContain('✓ 已全部收回');
  });

  it('runs the actual CLI process and real demo timers in under 60 seconds', async () => {
    fake.state.lockdownAvailable = true;
    fake.stages.splice(0, fake.stages.length, 'idle');
    fake.grantStatuses.splice(0, fake.grantStatuses.length, 'pending');
    const started = Date.now();
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli/vault.ts', 'demo'], {
      env: { PASSVAULT_URL: fake.url, PASSVAULT_AGENT_TOKEN: fake.token },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const deadline = setTimeout(() => { child.kill('SIGKILL'); }, 55_000);
    const intro = setTimeout(() => { fake.stages.splice(0, fake.stages.length, 'intro'); }, 350);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      // Simulate the owner's two phone actions; the CLI itself has no approval endpoint.
      if (stdout.includes('等你在手機上授權…') && fake.grant.status === 'pending') {
        fake.grantStatuses.splice(0, fake.grantStatuses.length, 'allowed');
      }
      if (stdout.includes('等你在手機上全部收回…')) fake.state.locked = true;
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    try {
      const [code] = await once(child, 'exit');
      expect(code).toBe(0);
      expect(stderr === '').toBe(true);
      expect(stdout).toContain('✓ 已全部收回');
      expect(fake.state.sent).toBe(50);
      expect(fake.calls).toHaveLength(5);
      expect(Date.now() - started).toBeGreaterThanOrEqual(26_000);
      expect(Date.now() - started).toBeLessThan(60_000);
    } finally {
      clearTimeout(deadline);
      clearTimeout(intro);
      child.kill();
    }
  }, 60_000);
});
