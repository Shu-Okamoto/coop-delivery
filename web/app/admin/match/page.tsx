'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';

type Stop = {
  type: 'pickup' | 'delivery';
  stop_order: number;
  request_id: number;
  member_id: number;
  address: string;
  lat: number;
  lng: number;
};
type Proposal = {
  group_index: number;
  request_count: number;
  total_weight_kg: number;
  estimated_distance_km: number;
  stops: Stop[];
  cost_shares: { request_id: number; shipper_id: number; weight_share: number; amount_yen: number }[];
  request_ids: number[];
};
type Driver = { id: number; name: string; vehicle_type: string; vehicle_capacity_kg: number };

export default function MatchPage() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [params, setParams] = useState({
    date: today,
    max_radius_km: 15,
    capacity_kg: 1000,
    refrigerated: false,
  });
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDrivers, setSelectedDrivers] = useState<Record<number, number>>({});

  useEffect(() => { apiGet<Driver[]>('/api/drivers').then(setDrivers); }, []);

  const run = async () => {
    setMessage(null);
    const result = await apiPost<{ groups: Proposal[]; message?: string }>('/api/match/suggest', params);
    setProposals(result.groups || []);
    setMessage(result.message || null);
  };

  const confirm = async (g: Proposal) => {
    const driverId = selectedDrivers[g.group_index] || drivers[0]?.id;
    if (!driverId) { alert('ドライバーを選択してください'); return; }
    const stops = g.stops.map((s) => ({
      stop_type: s.type,
      request_id: s.request_id,
      member_id: s.member_id,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
    }));
    try {
      const r = await apiPost<{ route_code: string }>('/api/routes', {
        driver_id: driverId,
        scheduled_date: params.date,
        request_ids: g.request_ids,
        stops,
        total_distance_km: g.estimated_distance_km,
        cost_shares: g.cost_shares,
      });
      alert(`ルート ${r.route_code} を確定しました`);
      router.push('/admin/routes');
    } catch (e: any) {
      alert('確定失敗: ' + e.message);
    }
  };

  return (
    <>
      <h2>マッチング提案</h2>
      <div className="card">
        <div className="form-grid">
          <label>対象日
            <input type="date" value={params.date}
                   onChange={(e) => setParams({ ...params, date: e.target.value })} />
          </label>
          <label>クラスタ半径(km)
            <input type="number" value={params.max_radius_km}
                   onChange={(e) => setParams({ ...params, max_radius_km: +e.target.value })} />
          </label>
          <label>車両容量(kg)
            <input type="number" value={params.capacity_kg}
                   onChange={(e) => setParams({ ...params, capacity_kg: +e.target.value })} />
          </label>
          <label>冷蔵車
            <select value={params.refrigerated ? '1' : '0'}
                    onChange={(e) => setParams({ ...params, refrigerated: e.target.value === '1' })}>
              <option value="0">不要</option>
              <option value="1">必要</option>
            </select>
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={run}>マッチング実行</button>
        </div>
      </div>

      {message && <p>{message}</p>}

      {proposals.map((g) => (
        <div className="proposal" key={g.group_index}>
          <h3>提案 {g.group_index} — {g.request_count}件を1便にまとめる</h3>
          <div className="proposal-meta">
            <span>合計重量: <strong>{g.total_weight_kg}kg</strong></span>
            <span>推定距離: <strong>{g.estimated_distance_km}km</strong></span>
            <span>推定運行費: <strong>¥{(g.estimated_distance_km * 80).toLocaleString()}</strong></span>
          </div>
          <ol className="stops">
            {g.stops.map((s) => (
              <li key={s.stop_order} className={s.type}>
                <span className="stop-num">{s.stop_order}</span>
                <span>{s.type === 'pickup' ? '🟠 集荷' : '🟢 配達'}</span>
                <span>{s.address}</span>
              </li>
            ))}
          </ol>
          <table style={{ marginTop: 8, fontSize: 12 }}>
            <thead><tr><th>依頼ID</th><th>重量按分</th><th>負担額</th></tr></thead>
            <tbody>
              {g.cost_shares.map((c) => (
                <tr key={c.request_id}>
                  <td>#{c.request_id}</td>
                  <td>{(c.weight_share * 100).toFixed(1)}%</td>
                  <td>¥{c.amount_yen.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="confirm-bar">
            <select
              value={selectedDrivers[g.group_index] || ''}
              onChange={(e) =>
                setSelectedDrivers({ ...selectedDrivers, [g.group_index]: +e.target.value })
              }
            >
              <option value="">ドライバー選択...</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.vehicle_type}, {d.vehicle_capacity_kg}kg)
                </option>
              ))}
            </select>
            <button className="btn" onClick={() => confirm(g)}>このルートで確定</button>
          </div>
        </div>
      ))}
    </>
  );
}
