const BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:10000';

// localStorage に保存したパスワードを取得
function getPassword(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('coop_password') || '';
}

function authHeaders(): Record<string, string> {
  const pw = getPassword();
  return pw ? { 'X-Viewer-Password': pw } : {};
}

// ドライバーPIN (localStorage の coop_driver から取得)
function driverHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const saved = localStorage.getItem('coop_driver_pin');
  return saved ? { 'X-Driver-Pin': saved } : {};
}

// ドライバー認証付き GET
export async function driverGet<T = any>(path: string): Promise<T> {
  const BASE2 = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:10000';
  const res = await fetch(`${BASE2}${path}`, {
    cache: 'no-store',
    headers: { ...driverHeaders() },
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: 'no-store',
    headers: { ...authHeaders() },
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function apiPut<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  return res.json();
}

// FormData (写真アップロード) 用。viewer/driver どちらの認証ヘッダーも付ける
export async function apiPostForm<T = any>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders() };
  if (typeof window !== 'undefined') {
    const pin = localStorage.getItem('coop_driver_pin');
    if (pin) headers['X-Driver-Pin'] = pin;
  }
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers, // Content-Type は fetch が自動設定 (multipart boundary)
    body: form,
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// 認証チェック
export async function checkAuth(password: string, role: 'viewer' | 'admin'): Promise<boolean> {
  const res = await fetch(`${BASE}/api/auth/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, role }),
  });
  return res.ok;
}

// ドライバーPIN認証
export async function checkDriverPin(pin: string): Promise<{ id: number; name: string; phone: string } | null> {
  const res = await fetch(`${BASE}/api/auth/driver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  // 以降のドライバー専用APIで使うPINを保存
  if (typeof window !== 'undefined') {
    localStorage.setItem('coop_driver_pin', pin);
  }
  return data.driver;
}

export const statusLabel = (s: string) =>
  ({
    planned: '計画済',
    in_progress: '配送中',
    completed: '完了',
    cancelled: 'キャンセル',
  } as Record<string, string>)[s] || s;

export const statusColor = (s: string) =>
  ({
    planned: '#e67e22',
    in_progress: '#3498db',
    completed: '#27ae60',
    cancelled: '#95a5a6',
  } as Record<string, string>)[s] || '#95a5a6';
