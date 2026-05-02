const BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:10000';

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export const statusLabel = (s: string) =>
  ({
    pending: '未割当',
    matched: 'マッチ済',
    picked_up: '集荷済',
    delivered: '配達完了',
    cancelled: 'キャンセル',
    planned: '計画済',
    in_progress: '進行中',
    completed: '完了',
  } as Record<string, string>)[s] || s;
