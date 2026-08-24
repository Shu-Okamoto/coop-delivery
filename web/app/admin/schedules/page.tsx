'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiGet, apiPost, apiPut, statusLabel, statusColor } from '@/lib/api';
import type { Route } from '@/lib/types';
import CapacityView, { type CapacitySchedule } from '@/components/CapacityView';

type ScheduleRow = {
  id: number; route_code: string; name: string;
  scheduled_date: string | null; status: string;
  radius_km: number | null; pickup_deadline: string | null;
};

type Req = {
  id: number; requester_name: string | null; delivery_name: string | null;
  pickup_address: string | null; cargo_description: string | null;
  ready_time: string | null; quantity: number | null; weight_kg: number | null;
  refrigerated: boolean; status: string; note: string | null;
  estimated_fee: number | null; final_fee: number | null;
};

const reqLabel: Record<string, string> = { pending: '承認待ち', approved: '成立', rejected: '却下' };
const fmt = (t: string | null) => (t ? new Date(t).toLocaleString('ja-JP') : '—');
const feeText = (q: { estimated_fee: number | null; final_fee: number | null }) =>
  q.final_fee != null ? `確定 ¥${q.final_fee.toLocaleString()}`
  : q.estimated_fee != null ? `概算 ¥${q.estimated_fee.toLocaleString()}` : '';

export default function AdminSchedulesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reqsById, setReqsById] = useState<Record<number, Req[]>>({});
  const [openId, setOpenId] = useState<number | null>(null);

  const [planRouteId, setPlanRouteId] = useState(0);
  const [planDate, setPlanDate] = useState('');
  const [planRadius, setPlanRadius] = useState('10');
  const [planCapacity, setPlanCapacity] = useState('');
  const [planInitial, setPlanInitial] = useState('');
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const [capOpenId, setCapOpenId] = useState<number | null>(null);
  const [capById, setCapById] = useState<Record<number, CapacitySchedule>>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState({ scheduled_date: '', radius_km: '', capacity_kg: '', initial_load_kg: '' });
  const [editStops, setEditStops] = useState<{ id: number; label: string; stop_type: string; own_unload_kg: string }[]>([]);

  const openEdit = async (routeId: number) => {
    if (editId === routeId) { setEditId(null); return; }
    try {
      const d = await apiGet<any>(`/api/schedules/${routeId}`);
      setEdit({
        scheduled_date: d.scheduled_date || '',
        radius_km: d.radius_km != null ? String(d.radius_km) : '',
        capacity_kg: d.capacity_kg != null ? String(d.capacity_kg) : '',
        initial_load_kg: d.initial_load_kg != null ? String(d.initial_load_kg) : '',
      });
      setEditStops((d.stops || []).map((s: any) => ({
        id: s.id, label: s.member_name || s.address || `地点${s.stop_order}`,
        stop_type: s.stop_type, own_unload_kg: s.own_unload_kg != null ? String(s.own_unload_kg) : '0',
      })));
      setEditId(routeId);
    } catch (e: any) {
      alert('取得に失敗: ' + e.message);
    }
  };
  const saveEdit = async (id: number) => {
    try {
      await apiPut(`/api/schedules/${id}`, {
        ...edit,
        stop_unloads: editStops.map((s) => ({ id: s.id, own_unload_kg: s.own_unload_kg })),
      });
      setEditId(null);
      setCapById((prev) => { const n = { ...prev }; delete n[id]; return n; });
      load();
    } catch (e: any) {
      alert('編集に失敗: ' + e.message);
    }
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const [all, recruiting] = await Promise.all([
        apiGet<Route[]>('/api/routes'),
        apiGet<ScheduleRow[]>('/api/schedules?status=recruiting'),
      ]);
      setRoutes(all);
      setSchedules(recruiting);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 予定作成の元にできるルート（既存ルート作成で作ったもの＝計画済 / 未予定）
  const selectableRoutes = routes.filter((r) => r.status === 'planned' || r.status === 'draft');

  const createPlan = async () => {
    setPlanMsg(null); setError(null);
    if (!planRouteId) { setError('ルートを選択してください'); return; }
    if (!planDate) { setError('日付を選択してください'); return; }
    try {
      await apiPost(`/api/schedules/${planRouteId}/publish`, {
        scheduled_date: planDate, radius_km: Number(planRadius),
        capacity_kg: planCapacity, initial_load_kg: planInitial,
      });
      setPlanMsg('予定を作成し、集荷募集を開始しました（締切は前日18時）。');
      setPlanRouteId(0); setPlanDate(''); setPlanCapacity(''); setPlanInitial('');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleCap = async (routeId: number) => {
    if (capOpenId === routeId) { setCapOpenId(null); return; }
    try {
      const detail = await apiGet<CapacitySchedule>(`/api/schedules/${routeId}`);
      setCapById((prev) => ({ ...prev, [routeId]: detail }));
      setCapOpenId(routeId);
    } catch (e: any) {
      alert('積載状況の取得に失敗: ' + e.message);
    }
  };

  const toggleReqs = async (r: ScheduleRow) => {
    if (openId === r.id) { setOpenId(null); return; }
    try {
      const list = await apiGet<Req[]>(`/api/schedules/${r.id}/requests`);
      setReqsById((prev) => ({ ...prev, [r.id]: list }));
      setOpenId(r.id);
    } catch (e: any) {
      alert('依頼の取得に失敗: ' + e.message);
    }
  };

  const decide = async (routeId: number, reqId: number, action: 'approve' | 'reject') => {
    try {
      await apiPost(`/api/requests/${reqId}/${action}`, {});
      const list = await apiGet<Req[]>(`/api/schedules/${routeId}/requests`);
      setReqsById((prev) => ({ ...prev, [routeId]: list }));
    } catch (e: any) {
      alert('処理に失敗: ' + e.message);
    }
  };

  return (
    <>
      <h2>予定作成</h2>
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>予定を作成</h3>
        <p style={{ fontSize: 12, color: '#7a8a99' }}>
          「＋ 新規ルート」で作成したルートを選び、配送日を決めると集荷募集が始まります（締切は前日18時）。
          ルートは消費されず、同じルートから何度でも予定を作成できます。
        </p>
        {selectableRoutes.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7a8a99' }}>
            元にできるルートがありません。先に
            <Link href="/admin/routes/new" style={{ margin: '0 4px' }}>＋ 新規ルート</Link>
            で作成してください。
          </p>
        ) : (
          <div className="form-grid">
            <label>ルートを選択
              <select value={planRouteId} onChange={(e) => setPlanRouteId(+e.target.value)}>
                <option value={0}>選択...</option>
                {selectableRoutes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.scheduled_date ? `（元: ${r.scheduled_date}）` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>配送日
              <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
            </label>
            <label>集荷受付の半径(km)
              <input type="number" step="1" value={planRadius}
                     onChange={(e) => setPlanRadius(e.target.value)} />
            </label>
            <label>トラック容量(kg)
              <input type="number" step="1" value={planCapacity} placeholder="例: 2000"
                     onChange={(e) => setPlanCapacity(e.target.value)} />
            </label>
            <label>出発時の積載(kg)
              <input type="number" step="0.1" value={planInitial} placeholder="例: 400"
                     onChange={(e) => setPlanInitial(e.target.value)} />
            </label>
          </div>
        )}
        {planMsg && <div style={{ marginTop: 8, color: '#1e7e46', fontSize: 13 }}>{planMsg}</div>}
        {selectableRoutes.length > 0 && (
          <button className="btn" style={{ marginTop: 10 }} onClick={createPlan}>予定を作成</button>
        )}
      </div>

      {/* 集荷募集中の予定（依頼の承認用） */}
      <h3 style={{ margin: '20px 0 8px' }}>集荷募集中の予定</h3>
      {schedules.length === 0 && <p className="empty">集荷募集中の予定はありません</p>}
      {schedules.map((r) => (
        <div key={r.id} className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b>{r.name}</b>
            <span className="badge" style={{ background: statusColor(r.status) }}>{statusLabel(r.status)}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#7a8a99' }}>
              {r.scheduled_date} / 締切 {fmt(r.pickup_deadline)} / 半径{r.radius_km}km
            </span>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn secondary small" onClick={() => toggleReqs(r)}>
              {openId === r.id ? '依頼を隠す' : '集荷依頼を見る／承認'}
            </button>
            <button className="btn secondary small" onClick={() => toggleCap(r.id)}>
              {capOpenId === r.id ? '積載状況を隠す' : '📦 積載状況'}
            </button>
            <button className="btn secondary small" onClick={() => openEdit(r.id)}>
              {editId === r.id ? '編集を閉じる' : '✏️ 予定を編集'}
            </button>
          </div>
          {capOpenId === r.id && capById[r.id] && (
            <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10 }}>
              <CapacityView schedule={capById[r.id]} />
            </div>
          )}
          {editId === r.id && (
            <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10 }}>
              <div className="form-grid">
                <label>配送日
                  <input type="date" value={edit.scheduled_date}
                         onChange={(e) => setEdit({ ...edit, scheduled_date: e.target.value })} />
                </label>
                <label>半径(km)
                  <input type="number" value={edit.radius_km}
                         onChange={(e) => setEdit({ ...edit, radius_km: e.target.value })} />
                </label>
                <label>トラック容量(kg)
                  <input type="number" value={edit.capacity_kg}
                         onChange={(e) => setEdit({ ...edit, capacity_kg: e.target.value })} />
                </label>
                <label>出発時の積載(kg)
                  <input type="number" step="0.1" value={edit.initial_load_kg}
                         onChange={(e) => setEdit({ ...edit, initial_load_kg: e.target.value })} />
                </label>
              </div>
              {editStops.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>経由地で下ろす自社の荷(kg)</div>
                  {editStops.map((s, i) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ flex: 1, fontSize: 13 }}>
                        {s.stop_type === 'pickup' ? '🟠' : '🟢'} {s.label}
                      </span>
                      <input type="number" step="0.1" style={{ width: 100 }} value={s.own_unload_kg}
                             onChange={(e) => setEditStops((prev) => prev.map((x, idx) => idx === i ? { ...x, own_unload_kg: e.target.value } : x))} />
                      <span style={{ fontSize: 12, color: '#7a8a99' }}>kg</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn small" onClick={() => saveEdit(r.id)}>保存</button>
                <button className="btn secondary small" onClick={() => setEditId(null)}>キャンセル</button>
              </div>
            </div>
          )}
          {openId === r.id && (
            <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
              {(reqsById[r.id] || []).length === 0 && <p style={{ fontSize: 13, color: '#7a8a99' }}>依頼はまだありません。</p>}
              {(reqsById[r.id] || []).map((q) => (
                <div key={q.id} style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 0', fontSize: 13 }}>
                  <div>
                    <b>{q.requester_name || '—'}</b>{' → '}{q.delivery_name || q.pickup_address || '配達先未指定'}
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
                    {feeText(q) ? <span style={{ color: '#8e44ad', fontWeight: 'bold' }}> / 💴 {feeText(q)}</span> : null}
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
    </>
  );
}
