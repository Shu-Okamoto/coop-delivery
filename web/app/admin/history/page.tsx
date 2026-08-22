'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';

type HistoryRow = {
  id: number;
  route_code: string;
  name: string;
  scheduled_date: string;
  start_time?: string | null;
  end_time?: string | null;
  driver_name?: string;
  vehicle_name?: string;
  stops_total: number;
  stops_completed: number;
  photos_count: number;
};

const fmtTime = (t?: string | null) =>
  t ? new Date(t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '—';

export default function HistoryPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const q = params.toString() ? `?${params.toString()}` : '';
      setRows(await apiGet<HistoryRow[]>(`/api/history${q}`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <h2>配送履歴</h2>
      <div className="toolbar">
        <label>期間:{' '}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <span>〜</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        {(from || to) && (
          <button className="btn secondary small" onClick={() => { setFrom(''); setTo(''); }}>クリア</button>
        )}
        <button className="btn small" onClick={load}>再読込</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <p>読込中...</p>}
      {!loading && rows.length === 0 && <p className="empty">完了した配送はまだありません</p>}

      {rows.map((r) => (
        <div key={r.id} className="route-item">
          <div className="info">
            <div className="title">
              {r.name}{' '}
              <span className="badge" style={{ background: '#27ae60' }}>完了</span>
            </div>
            <div className="sub">
              {r.route_code} / {r.scheduled_date}
              {' '}/ ドライバー: {r.driver_name || '—'} / 車両: {r.vehicle_name || '—'}
            </div>
            <div className="sub">
              経由地 {r.stops_completed}/{r.stops_total} 完了
              {' '}/ 📷 {r.photos_count}枚
              {' '}/ 開始 {fmtTime(r.start_time)} → 終了 {fmtTime(r.end_time)}
            </div>
          </div>
          <div className="actions">
            <Link href={`/admin/history/${r.id}`} className="btn small">詳細</Link>
          </div>
        </div>
      ))}
    </>
  );
}
