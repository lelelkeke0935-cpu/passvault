import { mockRequest } from './mock';
export const params = new URLSearchParams(location.search);
export const isMock = params.has('mock');
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class ApiError extends Error { constructor(public status: number, message: string) {super(message);} }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (isMock) return mockRequest(path, init) as Promise<T>;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(path, {...init, cache: 'no-store', credentials: 'same-origin', signal: controller.signal});
    if (!response.ok) {
      let message = response.status === 401 ? '通行碼無效，請重新開啟授權連結。' : '暫時連不上，請稍後再試。';
      if (response.status === 413) {const data = await response.json(); message = data.error || '檔案超過上限';}
      throw new ApiError(response.status, message);
    }
    return await response.json() as T;
  } finally {clearTimeout(timeout);}
}
export const post = <T>(path: string, headers?: HeadersInit) => api<T>(path, {method: 'POST', headers});
export function poll(task: () => Promise<void>, ms: number) {
  let stopped = false, timer: number;
  const run = async () => {try {await task();} catch { /* Views own their connection state. */ } finally {if (!stopped) timer = window.setTimeout(run, ms);}};
  void run();
  return () => {stopped = true; clearTimeout(timer);};
}
export function tokenFromUrl() {
  // Keep the owner's fixed URL reloadable. Never render or persist its token elsewhere.
  return params.get('token') || '';
}
export const brand = '<span class="brand-mark" aria-hidden="true">▰</span><span>PassVault <small>推庫</small></span>';
export const timeLabel = (at: string) => {const date = new Date(at); return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleTimeString('zh-TW', {hour12:false});};
