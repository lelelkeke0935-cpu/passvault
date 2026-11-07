#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, safeErrorMessage, VaultError, type VaultClient } from '../agent/client.ts';
import { runDemo, type DemoOptions } from './demo.ts';

export interface CliOptions extends DemoOptions {
  client?: VaultClient;
  input?: AsyncIterable<Uint8Array | string>;
  inputIsTTY?: boolean;
}

async function readValue(input: AsyncIterable<Uint8Array | string>): Promise<string> {
  const chunks: Buffer[] = [];
  let buffer: Buffer | undefined;
  try {
    for await (const chunk of input) chunks.push(Buffer.from(chunk));
    buffer = Buffer.concat(chunks);
    // Remove only the final line ending from a pipe; spaces and other newlines are significant.
    const value = buffer.toString('utf8').replace(/\r?\n$/, '');
    if (!value) throw new VaultError('stdin 沒有內容，尚未收進保險箱。');
    return value;
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    buffer?.fill(0);
  }
}

export async function runCli(args: string[], options: CliOptions = {}): Promise<void> {
  const write = options.write ?? console.log;
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]!))) {
    write('用法：vault list | vault add <name> --type password|api_key（值由 stdin 輸入）| vault demo [--reset]');
    return;
  }
  const [command, name, flag, type] = args;
  const validList = command === 'list' && args.length === 1;
  const validDemo = command === 'demo' && (args.length === 1 || (args.length === 2 && name === '--reset'));
  const validAdd = command === 'add' && args.length === 4 && !!name && !name.startsWith('-')
    && flag === '--type' && (type === 'password' || type === 'api_key');
  if (!validList && !validDemo && !validAdd) throw new VaultError('指令格式不正確，請用 vault --help 查看用法。');
  const client = options.client ?? createClient({ signal: options.signal });
  if (validList) {
    const secrets = await client.listSecrets();
    write(secrets.length ? JSON.stringify(secrets, null, 2) : '保險箱裡還沒有可用的金鑰。');
    return;
  }
  if (validAdd) {
    if (options.inputIsTTY ?? process.stdin.isTTY) {
      throw new VaultError('請以管線或 stdin 重新導向輸入內容，避免終端機顯示密碼或金鑰。');
    }
    const value = await readValue(options.input ?? process.stdin);
    await client.addSecret(name!, type as 'password' | 'api_key', value);
    write('✓ 已收進保險箱（已加密）');
    return;
  }
  if (name === '--reset') {
    const result = await client.resetDemo();
    write(result.locked ? '保險箱還鎖著，請在舞台頁按 R 重設並解鎖' : '✓ Demo 已重設');
    return;
  }
  await runDemo(client, { ...options, color: options.color ?? !!process.stdout.isTTY });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  runCli(process.argv.slice(2), { signal: controller.signal }).catch((error: unknown) => {
    console.error(controller.signal.aborted ? '操作已停止。' : safeErrorMessage(error));
    process.exitCode = controller.signal.aborted ? 130 : 1;
  }).finally(() => {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  });
}
