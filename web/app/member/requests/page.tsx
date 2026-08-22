'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { memberGet, getMemberSession } from '@/lib/api';

type MyRequest = {
  id: number; route_name: string | null; route_date: string | null;
  cargo_description: string | null; ready_time: string | null;
  quantity: number | null; weight_kg: number | null;
  status: string; created_at: string; note: string | null;
};

const reqLabel: Record<string, string> = { pending: '承認待ち', approved: '成立', rejected: '却下' };
const reqColor: Record<string, string> = { pending: '#e67e22', approved: '#27ae60', rejected: '#c0392b' };

export default function MyRequestsPage() {
  const [rows, setRows] = useState<MyRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getMemberSession()) { location.href = '/member'; return; }
    memberGet<MyRequest[]>('/api/my/requests').then(setRows).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="driver-body">
      <header className="header"><h1>📨 自分の集荷依頼</h1></header>
      <main className="driver-main">
        <div style={{ marginBottom: 12 }}>
          <Link href="/member" style={{ color: '#7a8a99', fontSize: 13 }}>← マイページに戻る</Link>
        </div>
        {error && <div className="error-box">{error}</div>}
        {rows.length === 0 && <p className="empty">まだ依頼はありません。</p>}
        {rows.map((r) => (
          <div key={r.id} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b>{r.route_name || '（予定）'}</b>
              <span className="badge" style={{ background: reqColor[r.status] || '#95a5a6' }}>
                {reqLabel[r.status] || r.status}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#7a8a99' }}>
                配送日 {r.route_date || '—'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#555', marginTop: 6 }}>
              📦 {r.cargo_description || '—'}
              {r.quantity != null ? ` / 数量 ${r.quantity}` : ''}
              {r.weight_kg != null ? ` / ${r.weight_kg}kg` : ''}
              {r.ready_time ? ` / 準備完了 ${r.ready_time}` : ''}
              {r.note ? <div>備考: {r.note}</div> : null}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
