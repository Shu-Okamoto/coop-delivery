'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import RouteMap from '@/components/RouteMap';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import type { Member, Vehicle, Driver, RouteStop, Route } from '@/lib/types';

type Props = {
  // 編集時は既存ルートを渡す。新規時は undefined
  existing?: Route;
};

const emptyStop = (order: number): RouteStop => ({
  stop_order: order,
  stop_type: 'delivery',
  member_id: null,
  address: '',
  lat: 0,
  lng: 0,
  cargo_description: '',
  weight_kg: undefined,
  refrigerated: false,
  scheduled_time: '',
});

export default function RouteForm({ existing }: Props) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: existing?.name || '',
    scheduled_date: existing?.scheduled_date || new Date().toISOString().slice(0, 10),
    driver_id: existing?.driver_id || 0,
    vehicle_id: existing?.vehicle_id || 0,
    planned_start_time: existing?.planned_start_time?.slice(0, 5) || '08:00',
    status: existing?.status || 'planned',
    notes: existing?.notes || '',
  });

  const [stops, setStops] = useState<RouteStop[]>(
    existing?.stops && existing.stops.length > 0
      ? existing.stops.map((s) => ({ ...s, scheduled_time: s.scheduled_time?.slice(0, 5) || '' }))
      : [emptyStop(1), emptyStop(2)]
  );

  useEffect(() => {
    apiGet<Member[]>('/api/members').then(setMembers).catch(() => {});
    apiGet<Vehicle[]>('/api/vehicles').then(setVehicles).catch(() => {});
    apiGet<Driver[]>('/api/drivers').then(setDrivers).catch(() => {});
  }, []);

  // 経由地操作
  const updateStop = (i: number, patch: Partial<RouteStop>) => {
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  // 組合員を選んだら座標・住所を自動入力
  const onMemberSelect = (i: number, memberId: number) => {
    const m = members.find((x) => x.id === memberId);
    if (m) {
      updateStop(i, {
        member_id: m.id,
        address: m.address,
        lat: m.lat,
        lng: m.lng,
      });
    } else {
      updateStop(i, { member_id: null });
    }
  };

  const addStop = () => setStops((prev) => [...prev, emptyStop(prev.length + 1)]);

  const removeStop = (i: number) => {
    setStops((prev) =>
      prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, stop_order: idx + 1 }))
    );
  };

  const moveStop = (i: number, dir: -1 | 1) => {
    setStops((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((s, idx) => ({ ...s, stop_order: idx + 1 }));
    });
  };

  const save = async () => {
    setError(null);
    // バリデーション
    if (!form.name.trim()) { setError('ルート名を入力してください'); return; }
    const validStops = stops.filter((s) => s.address && s.lat && s.lng);
    if (validStops.length < 2) {
      setError('経由地は座標付きで2件以上必要です（組合員を選択するか住所を確定してください）');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        driver_id: form.driver_id || null,
        vehicle_id: form.vehicle_id || null,
        stops: validStops.map((s, i) => ({
          stop_order: i + 1,
          stop_type: s.stop_type,
          member_id: s.member_id || null,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          cargo_description: s.cargo_description || null,
          weight_kg: s.weight_kg || null,
          refrigerated: !!s.refrigerated,
          scheduled_time: s.scheduled_time || null,
          completed: s.completed || false,
          completed_at: s.completed_at || null,
          arrived_at: s.arrived_at || null,
          notes: s.notes || null,
          photo_url: s.photo_url || null,
        })),
      };

      if (existing) {
        await apiPut(`/api/routes/${existing.id}`, payload);
      } else {
        await apiPost('/api/routes', payload);
      }
      router.push('/admin/routes');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // 地図プレビュー用 (座標が入っている経由地のみ)
  const previewStops = stops.filter((s) => s.lat && s.lng);

  return (
    <>
      <h2>{existing ? `ルート編集: ${existing.route_code}` : '新規ルート登録'}</h2>
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>基本情報</h3>
        <div className="form-grid">
          <label>ルート名 *
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                   placeholder="例: 午前便A (周南→岩国)" />
          </label>
          <label>配送日 *
            <input type="date" value={form.scheduled_date}
                   onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
          </label>
          <label>ドライバー
            <select value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: +e.target.value })}>
              <option value={0}>未割当</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label>車両
            <select value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: +e.target.value })}>
              <option value={0}>未割当</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.capacity_kg}kg{v.refrigerated ? '・冷蔵' : ''})
                </option>
              ))}
            </select>
          </label>
          <label>予定開始時刻
            <input type="time" value={form.planned_start_time}
                   onChange={(e) => setForm({ ...form, planned_start_time: e.target.value })} />
          </label>
          <label>ステータス
            <select value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as Route['status'] })}>
              <option value="planned">計画済</option>
              <option value="in_progress">配送中</option>
              <option value="completed">完了</option>
              <option value="cancelled">キャンセル</option>
            </select>
          </label>
          <label className="full">備考
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>経由地 ({stops.length}件)</h3>
        <p style={{ fontSize: 13, color: '#7a8a99' }}>
          組合員を選ぶと住所と座標が自動入力されます。順序は ▲▼ で入れ替え。
        </p>
        {stops.map((s, i) => (
          <div key={i}>
            <div className="stop-row">
              <span className="stop-order-badge">{s.stop_order}</span>
              <select value={s.stop_type}
                      onChange={(e) => updateStop(i, { stop_type: e.target.value as 'pickup' | 'delivery' })}>
                <option value="pickup">🟠 集荷</option>
                <option value="delivery">🟢 配達</option>
              </select>
              <select value={s.member_id || 0} onChange={(e) => onMemberSelect(i, +e.target.value)}>
                <option value={0}>組合員を選択...</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input type="number" step="0.1" placeholder="kg" value={s.weight_kg ?? ''}
                     onChange={(e) => updateStop(i, { weight_kg: e.target.value ? +e.target.value : undefined })} />
              <input type="time" value={s.scheduled_time || ''}
                     onChange={(e) => updateStop(i, { scheduled_time: e.target.value })} />
              <button className="btn danger small" onClick={() => removeStop(i)} title="削除">✕</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, paddingLeft: 44, flexWrap: 'wrap' }}>
              <input
                style={{ flex: 2, padding: 6, border: '1px solid #d5dbdb', borderRadius: 4, fontSize: 13 }}
                placeholder="住所 (組合員未選択の場合は手入力)"
                value={s.address}
                onChange={(e) => updateStop(i, { address: e.target.value })}
              />
              <input
                style={{ width: 100, padding: 6, border: '1px solid #d5dbdb', borderRadius: 4, fontSize: 13 }}
                placeholder="緯度" type="number" step="0.0001"
                value={s.lat || ''}
                onChange={(e) => updateStop(i, { lat: +e.target.value })}
              />
              <input
                style={{ width: 100, padding: 6, border: '1px solid #d5dbdb', borderRadius: 4, fontSize: 13 }}
                placeholder="経度" type="number" step="0.0001"
                value={s.lng || ''}
                onChange={(e) => updateStop(i, { lng: +e.target.value })}
              />
              <input
                style={{ flex: 1, minWidth: 120, padding: 6, border: '1px solid #d5dbdb', borderRadius: 4, fontSize: 13 }}
                placeholder="荷物内容"
                value={s.cargo_description || ''}
                onChange={(e) => updateStop(i, { cargo_description: e.target.value })}
              />
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={!!s.refrigerated}
                       onChange={(e) => updateStop(i, { refrigerated: e.target.checked })} />
                冷蔵
              </label>
              <button className="btn secondary small" onClick={() => moveStop(i, -1)} disabled={i === 0}>▲</button>
              <button className="btn secondary small" onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1}>▼</button>
            </div>
          </div>
        ))}
        <button className="btn secondary small" onClick={addStop}>＋ 経由地を追加</button>
      </div>

      {previewStops.length >= 1 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>地図プレビュー</h3>
          <RouteMap stops={previewStops} drawDirections={previewStops.length >= 2} height="360px" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 40 }}>
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? '保存中...' : existing ? '更新する' : '登録する'}
        </button>
        <button className="btn secondary" onClick={() => router.push('/admin/routes')}>キャンセル</button>
      </div>
    </>
  );
}
