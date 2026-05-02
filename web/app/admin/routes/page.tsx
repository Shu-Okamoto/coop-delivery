'use client';
import { useEffect, useState } from 'react';
import { apiGet, statusLabel } from '@/lib/api';

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

type RouteDetail = Route & {
  stops: Array<{
    id: number;
    stop_order: number;
    stop_type: string;
    member_name: string;
    cargo_description: string;
    weight_kg: number;
    refrigerated: boolean;
    completed: boolean;
  }>;
  cost_shares: Array<{
    shipper_name: string;
    weight_share: number;
    amount_yen: number;
  }>;
};

export default function RoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [detail, setDetail] = useState<RouteDetail | null>(null);

  useEffect(() => { apiGet<Route[]>('/api/routes').then(setRoutes); }, []);

  const showDetail = async (id: number) => {
    const d = await apiGet<RouteDetail>(`/api/routes/${id}`);
    setDetail(d);
  };

  return (
    <>
      <h2>ルート管理</h2>
      {routes.length === 0 ? (
        <p>確定済みルートはまだありません</p>
      ) : (
        routes.map((r) => (
          <div className="card" key={r.id} style={{ cursor: 'pointer' }} onClick={() => showDetail(r.id)}>
            <strong>{r.route_code}</strong> — {r.scheduled_date}{' '}
            <span className={`status-${r.status}`}>[{statusLabel(r.status)}]</span><br />
            ドライバー: {r.driver_name || '-'} / 距離: {r.total_distance_km || '?'}km / 重量: {r.total_weight_kg}kg
          </div>
        ))
      )}

      {detail && (
        <div className="card">
          <h3>{detail.route_code} の詳細</h3>
          <p>ドライバー: {detail.driver_name} ({detail.driver_phone || '-'}) / 状態: {statusLabel(detail.status)}</p>
          <ol className="stops">
            {detail.stops.map((s) => (
              <li key={s.id} className={s.stop_type}>
                <span className="stop-num">{s.stop_order}</span>
                {s.stop_type === 'pickup' ? '🟠 集荷' : '🟢 配達'}: {s.member_name}{' '}
                ({s.weight_kg}kg {s.refrigerated ? '❄️' : ''})
                {s.completed && ' ✅ 完了'}
              </li>
            ))}
          </ol>
          <h4>コスト分担</h4>
          <table style={{ fontSize: 12 }}>
            <thead><tr><th>負担者</th><th>割合</th><th>金額</th></tr></thead>
            <tbody>
              {detail.cost_shares.map((c, i) => (
                <tr key={i}>
                  <td>{c.shipper_name}</td>
                  <td>{(c.weight_share * 100).toFixed(1)}%</td>
                  <td>¥{c.amount_yen.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
