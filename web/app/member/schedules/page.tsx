'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { memberGet, memberPost, getMemberSession, statusLabel, statusColor } from '@/lib/api';

type MyRoute = {
  id: number; route_code: string; name: string;
  scheduled_date: string | null; status: string;
  radius_km: number | null; pickup_deadline: string | null;
};

type Req = {
  id: number; requester_name: string | null; delivery_name: string | null;
  pickup_address: string | null; cargo_description: string | null;
  ready_time: string | null; quantity: number | null; weight_kg: number | null;
  refrigerated: boolean; status: string; note: string | null;
};

const reqLabel: Record<string, string> = { pending: '承認待ち', approved: '成立', rejected: '却下' };

export default function MySchedulesPage() {
  const [routes, setRoutes] = useState<MyRoute[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reqsById, setReqsById] = useState<Record<number, Req[]>>({});
  const [openId, setOpenId] = useState<number | null>(null);

  const load = () => {
    memberGet<MyRoute[]>('/api/my/schedules').then(setRoutes).catch((e) => setError(e.message));
  };

  useEffect(() => {
    if (!getMemberSession()) { location.href = '/member'; return; }
    load();
  }, []);

  const publish = async (r: MyRoute) => {
    const date = window.prompt('配送日を入力してください（YYYY-MM-DD）', r.scheduled_date || '');
    if (!date) return;
    const radius = window.prompt('集荷受付の半径(km)を入力してください', String(r.radius_km || 10));
    if (radius === null) return;
    try {
      await memberPost(`/api/schedules/${r.id}/publish`, { scheduled_date: date, radius_km: Number(radius) });
      load();
    } catch (e: any) {
      alert('予定化に失敗: ' + e.message);
    }
  };

  const toggleReqs = async (r: MyRoute) => {
    if (openId === r.id) { setOpenId(null); return; }
    try {
      const list = await memberGet<Req[]>(`/api/schedules/${r.id}/requests`);
      setReqsById((prev) => ({ ...prev, [r.id]: list }));
      setOpenId(r.id);
    } catch (e: any) {
      alert('依頼の取得に失敗: ' + e.message);
    }
  };

  const decide = async (routeId: number, reqId: number, action: 'approve' | 'reject') => {
    try {
      await memberPost(`/api/requests/${reqId}/${action}`, {});
      const list = await memberGet<Req[]>(`/api/schedules/${routeId}/requests`);
      setReqsById((prev) => ({ ...prev, [routeId]: list }));
    } catch (e: any) {
      alert('処理に失敗: ' + e.message);
    }
  };

  return (
    <div className="driver-body">
      <header className="header"><h1>🗂 自分の予定</h1></header>
      <main className="driver-main">
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/member" style={{ color: '#7a8a99', fontSize: 13 }}>← マイページ</Link>
          <span className="spacer" style={{ flex: 1 }} />
          <Link href="/member/schedules/new" className="btn small">＋ ルート下書きを作成</Link>
        </div>
        {error && <div className="error-box">{error}</div>}
        {routes.length === 0 && <p className="empty">まだ予定・下書きはありません。</p>}

        {routes.map((r) => (
          <div key={r.id} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b>{r.name}</b>
              <span className="badge" style={{ background: statusColor(r.status) }}>{statusLabel(r.status)}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#7a8a99' }}>
                {r.scheduled_date || '日付未定'}
              </span>
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {r.status === 'draft' && (
                <button className="btn small" onClick={() => publish(r)}>予定化（日付・半径を決める）</button>
              )}
              {(r.status === 'recruiting' || r.status === 'planned') && (
                <button className="btn secondary small" onClick={() => toggleReqs(r)}>
                  {openId === r.id ? '依頼を隠す' : '集荷依頼を見る／承認'}
                </button>
              )}
            </div>

            {openId === r.id && (
              <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
                {(reqsById[r.id] || []).length === 0 && <p style={{ fontSize: 13, color: '#7a8a99' }}>依頼はまだありません。</p>}
                {(reqsById[r.id] || []).map((q) => (
                  <div key={q.id} style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 0', fontSize: 13 }}>
                    <div>
                      <b>{q.requester_name || '—'}</b>
                      {' → '}{q.delivery_name || q.pickup_address || '配達先未指定'}
                      {' '}<span className="badge" style={{ background: q.status === 'approved' ? '#27ae60' : q.status === 'rejected' ? '#c0392b' : '#e67e22' }}>
                        {reqLabel[q.status] || q.status}
                      </span>
                    </div>
                    <div style={{ color: '#555' }}>
                      📦 {q.cargo_description || '—'}
                      {q.quantity != null ? ` / 数量 ${q.quantity}` : ''}
                      {q.weight_kg != null ? ` / ${q.weight_kg}kg` : ''}
                      {q.ready_time ? ` / 準備 ${q.ready_time}` : ''}
                      {q.refrigerated ? ' ❄️' : ''}
                      {q.note ? ` / 備考: ${q.note}` : ''}
                    </div>
                    {q.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button className="btn small" onClick={() => decide(r.id, q.id, 'approve')}>承認</button>
                        <button className="btn danger small" onClick={() => decide(r.id, q.id, 'reject')}>却下</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
