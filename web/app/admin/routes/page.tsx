'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiGet, apiDelete, statusLabel, statusColor } from '@/lib/api';
import type { Route } from '@/lib/types';

export default function AdminRoutesPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState('');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = date ? `?date=${date}` : '';
      const data = await apiGet<Route[]>(`/api/routes${q}`);
      setRoutes(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const del = async (r: Route) => {
    if (!confirm(`ルート「${r.name}」を削除しますか？\nこの操作は取り消せません。`)) return;
    try {
      await apiDelete(`/api/routes/${r.id}`);
      load();
    } catch (e: any) {
      alert('削除失敗: ' + e.message);
    }
  };

  return (
    <>
      <h2>ルート管理</h2>
      <div className="toolbar">
        <label>
          日付フィルタ:{' '}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {date && <button className="btn secondary small" onClick={() => setDate('')}>クリア</button>}
        <button className="btn small" onClick={load}>再読込</button>
        <Link href="/admin/routes/new" className="btn small">＋ 新規ルート</Link>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <p>読込中...</p>}
      {!loading && routes.length === 0 && <p className="empty">ルートがありません</p>}

      {routes.map((r) => (
        <div key={r.id} className="route-item">
          <div className="info">
            <div className="title">
              {r.name}{' '}
              <span className="badge" style={{ background: statusColor(r.status) }}>
                {statusLabel(r.status)}
              </span>
            </div>
            <div className="sub">
              {r.route_code} / {r.scheduled_date}
              {r.planned_start_time && ` ${r.planned_start_time}`}
              {' '}/ ドライバー: {r.driver_name || '未割当'} / 車両: {r.vehicle_name || '未割当'}
            </div>
          </div>
          <div className="actions">
            <Link href={`/admin/routes/${r.id}`} className="btn small">編集</Link>
            <button className="btn danger small" onClick={() => del(r)}>削除</button>
          </div>
        </div>
      ))}
    </>
  );
}
