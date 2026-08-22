'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiGet, statusLabel, statusColor } from '@/lib/api';
import type { Route, RouteStop } from '@/lib/types';

const fmtDateTime = (t?: string | null) =>
  t ? new Date(t).toLocaleString('ja-JP') : '—';
const fmtTime = (t?: string | null) =>
  t ? new Date(t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '—';

export default function HistoryDetailPage() {
  const params = useParams();
  const id = params?.id;
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiGet<Route>(`/api/history/${id}`).then(setRoute).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="error-box">{error}</div>;
  if (!route) return <p>読込中...</p>;

  const stops: RouteStop[] = route.stops || [];
  const completed = stops.filter((s) => s.completed).length;

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/history" style={{ color: '#7a8a99', fontSize: 13 }}>← 配送履歴に戻る</Link>
      </div>
      <h2>
        {route.name}{' '}
        <span className="badge" style={{ background: statusColor(route.status) }}>
          {statusLabel(route.status)}
        </span>
      </h2>

      <div className="card">
        <div className="form-grid">
          <div><b>ルートコード</b><br />{route.route_code}</div>
          <div><b>配送日</b><br />{route.scheduled_date}</div>
          <div><b>ドライバー</b><br />{route.driver_name || '—'}{route.driver_phone ? ` (${route.driver_phone})` : ''}</div>
          <div><b>車両</b><br />{route.vehicle_name || '—'}{route.vehicle_plate ? ` (${route.vehicle_plate})` : ''}</div>
          <div><b>開始</b><br />{fmtDateTime(route.start_time)}</div>
          <div><b>終了</b><br />{fmtDateTime(route.end_time)}</div>
        </div>
        <p style={{ marginTop: 12, color: '#7a8a99', fontSize: 13 }}>
          経由地 {completed}/{stops.length} 完了
        </p>
      </div>

      <h3>経由地の記録</h3>
      {stops.map((s) => (
        <div key={s.id} className="card" style={{ borderLeft: `4px solid ${s.stop_type === 'pickup' ? '#e67e22' : '#27ae60'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className="stop-order-badge">{s.stop_order}</span>
            <b style={{ color: s.stop_type === 'pickup' ? '#e67e22' : '#27ae60' }}>
              {s.stop_type === 'pickup' ? '🟠 集荷' : '🟢 配達'}
            </b>
            <span>{s.member_name || s.address}</span>
            {s.completed
              ? <span style={{ marginLeft: 'auto', background: '#27ae60', color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>✓ 完了</span>
              : <span style={{ marginLeft: 'auto', color: '#95a5a6', fontSize: 12 }}>未完了</span>}
          </div>
          <div style={{ fontSize: 13, color: '#555' }}>
            <div>{s.address}</div>
            {s.cargo_description && <div>📦 {s.cargo_description}{s.weight_kg ? ` (${s.weight_kg}kg)` : ''}{s.refrigerated ? ' ❄️' : ''}</div>}
            <div>予定時刻: {s.scheduled_time || '—'} / 到着: {fmtTime(s.arrived_at)} / 完了: {fmtDateTime(s.completed_at)}</div>
            {s.notes && <div>メモ: {s.notes}</div>}
          </div>
          {s.photo_url && (
            <div style={{ marginTop: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.photo_url} alt="完了写真" style={{ maxWidth: 320, width: '100%', borderRadius: 8, border: '1px solid #eee' }} />
              <div style={{ fontSize: 12, color: '#7a8a99', marginTop: 4 }}>
                撮影(完了)時刻: {fmtDateTime(s.completed_at)}
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
