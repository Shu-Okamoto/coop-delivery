'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';

type Route = {
  id: number;
  route_code: string;
  scheduled_date: string;
  driver_name: string;
  driver_phone: string;
  total_distance_km: number;
  total_weight_kg: number;
  status: string;
};

type Stop = {
  id: number;
  stop_order: number;
  stop_type: 'pickup' | 'delivery';
  member_name: string;
  address: string;
  lat: number;
  lng: number;
  cargo_description: string;
  weight_kg: number;
  refrigerated: boolean;
  completed: boolean;
  actual_time: string | null;
};

type Detail = Route & { stops: Stop[] };

export default function DriverPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const loadList = async () => {
    const all = await apiGet<Route[]>('/api/routes');
    setRoutes(all.filter((r) => r.status !== 'completed' && r.status !== 'cancelled'));
  };
  useEffect(() => { loadList(); }, []);

  const loadRoute = async () => {
    if (!selectedId) return;
    const d = await apiGet<Detail>(`/api/routes/${selectedId}`);
    setDetail(d);
  };

  const completeStop = async (stopId: number) => {
    if (!confirm('このストップを完了にしますか?')) return;
    await apiPost(`/api/stops/${stopId}/complete`, { notes: notes[stopId] || null });
    loadRoute();
  };

  const completed = detail?.stops.filter((s) => s.completed).length || 0;
  const total = detail?.stops.length || 0;
  const pct = total ? (completed / total) * 100 : 0;
  const currentIdx = detail?.stops.findIndex((s) => !s.completed) ?? -1;

  return (
    <div className="driver-body">
      <header className="header">
        <h1>🚚 配送ルート</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            style={{ flex: 1, padding: 10, borderRadius: 4, border: 'none', fontSize: 16 }}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value ? +e.target.value : '')}
          >
            <option value="">ルートを選択...</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.route_code} ({r.scheduled_date}) — {r.driver_name || '未割当'}
              </option>
            ))}
          </select>
          <button className="btn" onClick={loadRoute} style={{ background: '#97bc62' }}>
            表示
          </button>
        </div>
      </header>

      <main className="driver-main">
        {!detail && <p style={{ textAlign: 'center', color: '#7a8a99', padding: 40 }}>ルートを選択してください</p>}

        {detail && (
          <>
            <div className="card">
              <h2 style={{ margin: '0 0 8px', color: '#2c5f2d' }}>{detail.route_code}</h2>
              <div style={{ fontSize: 14, color: '#7a8a99' }}>
                {detail.scheduled_date} / ドライバー: {detail.driver_name || '-'}<br />
                距離 {detail.total_distance_km || '?'}km / 重量 {detail.total_weight_kg}kg<br />
                進捗: {completed} / {total} 完了
              </div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
            </div>

            {detail.stops.map((s, i) => {
              const isCurrent = i === currentIdx;
              const cls = ['stop-card', s.stop_type, s.completed ? 'completed' : '', isCurrent ? 'current' : '']
                .filter(Boolean).join(' ');
              const typeLabel = s.stop_type === 'pickup' ? '集荷' : '配達';

              return (
                <div className={cls} key={s.id}>
                  <div className="stop-header">
                    <div className="stop-num-big">{s.stop_order}</div>
                    <div style={{ fontWeight: 'bold', fontSize: 16, color: s.stop_type === 'pickup' ? '#e67e22' : '#27ae60' }}>
                      {s.stop_type === 'pickup' ? '🟠' : '🟢'} {typeLabel}先
                    </div>
                    {s.completed && (
                      <span style={{ marginLeft: 'auto', background: '#27ae60', color: '#fff', padding: '4px 12px', borderRadius: 12, fontSize: 12 }}>✓ 完了</span>
                    )}
                  </div>
                  <div style={{ fontSize: 14 }}>
                    <div style={{ color: '#7a8a99', fontSize: 12 }}>店舗・組合員</div>
                    <div><strong>{s.member_name}</strong></div>
                    <div style={{ color: '#7a8a99', fontSize: 12, marginTop: 6 }}>住所</div>
                    <div>{s.address}</div>
                    {s.lat && s.lng && (
                      <a className="tel-link" target="_blank" rel="noopener noreferrer"
                         href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}>
                        📍 地図を開く
                      </a>
                    )}
                    <div className="cargo-info">
                      📦 {s.cargo_description || '-'} ({s.weight_kg}kg)
                      {s.refrigerated && <span style={{ color: '#2980b9', fontWeight: 'bold' }}> ❄️ 要冷蔵</span>}
                    </div>
                    {!s.completed && (
                      <>
                        <input
                          className="notes-input"
                          placeholder="メモ(任意)"
                          value={notes[s.id] || ''}
                          onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })}
                        />
                        <button className="complete-btn" disabled={!isCurrent} onClick={() => completeStop(s.id)}>
                          {isCurrent ? `この${typeLabel}を完了` : '前のストップを完了させてください'}
                        </button>
                      </>
                    )}
                    {s.actual_time && (
                      <div style={{ color: '#7a8a99', fontSize: 12, marginTop: 8 }}>
                        完了時刻: {new Date(s.actual_time).toLocaleString('ja-JP')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
