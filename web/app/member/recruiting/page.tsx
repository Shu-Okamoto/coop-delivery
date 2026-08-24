'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, memberGet, memberPost, getMemberSession } from '@/lib/api';
import type { Member } from '@/lib/types';

type Schedule = {
  id: number; route_code: string; name: string;
  scheduled_date: string; radius_km: number;
  pickup_deadline: string | null; creator_name: string | null;
  center: { lat: number; lng: number } | null;
};

type Stop = {
  id: number; stop_order: number; stop_type: 'pickup' | 'delivery';
  member_id: number | null; member_name: string | null; address: string;
  lat: number; lng: number;
};

const fmtDeadline = (t: string | null) => (t ? new Date(t).toLocaleString('ja-JP') : '—');

export default function RecruitingPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [stopsById, setStopsById] = useState<Record<number, Stop[]>>({});
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [estFee, setEstFee] = useState<number | null>(null);

  const [form, setForm] = useState({
    pickup_mode: 'stop' as 'stop' | 'new',
    pickup_stop_id: 0,
    pickup_new_member_id: 0,
    delivery_stop_id: 0,
    cargo_description: '', ready_time: '',
    quantity: '', weight_kg: '', refrigerated: false, note: '',
  });

  const load = () => {
    memberGet<Schedule[]>('/api/schedules?status=recruiting').then(setSchedules).catch((e) => setError(e.message));
  };

  useEffect(() => {
    if (!getMemberSession()) { location.href = '/member'; return; }
    load();
    apiGet<Member[]>('/api/members').then(setMembers).catch(() => {});
  }, []);

  const withCoords = members.filter((m) => m.lat != null && m.lng != null);

  const openForm = async (id: number) => {
    setMsg(null); setError(null);
    setForm({
      pickup_mode: 'stop', pickup_stop_id: 0, pickup_new_member_id: 0, delivery_stop_id: 0,
      cargo_description: '', ready_time: '', quantity: '', weight_kg: '', refrigerated: false, note: '',
    });
    try {
      const detail = await memberGet<{ stops: Stop[] }>(`/api/schedules/${id}`);
      setStopsById((prev) => ({ ...prev, [id]: detail.stops || [] }));
    } catch { setStopsById((prev) => ({ ...prev, [id]: [] })); }
    setOpenId(id);
  };

  // 現在の集荷地点(座標・経由地順)
  const pickupInfo = (scheduleId: number) => {
    const stops = stopsById[scheduleId] || [];
    if (form.pickup_mode === 'stop') {
      const st = stops.find((s) => s.id === form.pickup_stop_id);
      return st ? { lat: st.lat, lng: st.lng, order: st.stop_order, address: st.member_name || st.address } : null;
    }
    const m = members.find((x) => x.id === form.pickup_new_member_id);
    return m && m.lat != null && m.lng != null ? { lat: m.lat, lng: m.lng, order: null as number | null, address: m.address } : null;
  };

  // 配達先候補: 集荷地からゴールの間の経由地のみ
  const deliveryCandidates = (scheduleId: number) => {
    const stops = stopsById[scheduleId] || [];
    const pu = pickupInfo(scheduleId);
    if (form.pickup_mode === 'stop' && pu?.order != null) {
      return stops.filter((s) => s.stop_order > (pu.order as number));
    }
    return stops; // 新しい集荷地の場合はゴールまでの全経由地
  };

  // 概算料金
  useEffect(() => {
    if (openId == null) { setEstFee(null); return; }
    const pu = pickupInfo(openId);
    if (!pu) { setEstFee(null); return; }
    const stops = stopsById[openId] || [];
    const del = stops.find((s) => s.id === form.delivery_stop_id);
    memberPost<{ fee: number }>('/api/pricing/quote', {
      pickup_lat: pu.lat, pickup_lng: pu.lng,
      delivery_lat: del?.lat ?? null, delivery_lng: del?.lng ?? null,
      weight_kg: form.weight_kg, refrigerated: form.refrigerated,
    }).then((r) => setEstFee(r.fee)).catch(() => setEstFee(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, form.pickup_mode, form.pickup_stop_id, form.pickup_new_member_id, form.delivery_stop_id, form.weight_kg, form.refrigerated]);

  const submit = async (schedule: Schedule) => {
    setError(null); setMsg(null);
    const pu = pickupInfo(schedule.id);
    if (!pu) { setError('集荷場所を選択してください'); return; }
    const payload: any = {
      cargo_description: form.cargo_description,
      ready_time: form.ready_time || null,
      quantity: form.quantity, weight_kg: form.weight_kg,
      refrigerated: form.refrigerated, note: form.note,
      delivery_stop_id: form.delivery_stop_id || null,
    };
    if (form.pickup_mode === 'stop') {
      payload.pickup_stop_id = form.pickup_stop_id;
    } else {
      payload.pickup_lat = pu.lat; payload.pickup_lng = pu.lng; payload.pickup_address = pu.address;
    }
    try {
      await memberPost(`/api/schedules/${schedule.id}/requests`, payload);
      setMsg('集荷依頼を送信しました。作成者の承認をお待ちください。');
      setOpenId(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="driver-body">
      <header className="header"><h1>🔎 集荷募集中の予定</h1></header>
      <main className="driver-main">
        <div style={{ marginBottom: 12 }}>
          <Link href="/member" style={{ color: '#7a8a99', fontSize: 13 }}>← マイページに戻る</Link>
        </div>
        {error && <div className="error-box">{error}</div>}
        {msg && <div className="card" style={{ background: '#eafaf1', color: '#1e7e46' }}>{msg}</div>}
        {schedules.length === 0 && <p className="empty">現在、集荷募集中の予定はありません。</p>}

        {schedules.map((s) => {
          const stops = stopsById[s.id] || [];
          const delCands = deliveryCandidates(s.id);
          return (
            <div key={s.id} className="card">
              <h3 style={{ marginTop: 0 }}>
                {s.name}{' '}<span className="badge" style={{ background: '#8e44ad' }}>集荷募集中</span>
              </h3>
              <div style={{ fontSize: 13, color: '#555' }}>
                配送日: {s.scheduled_date} / 作成: {s.creator_name || '—'}<br />
                締切: {fmtDeadline(s.pickup_deadline)}（前日18時）<br />
                受付範囲: ルート中心から半径 {s.radius_km}km 以内
              </div>

              {openId === s.id ? (
                <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
                  {/* 集荷地の選択 */}
                  <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>集荷場所</div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 13 }}>
                      <input type="radio" checked={form.pickup_mode === 'stop'}
                             onChange={() => setForm({ ...form, pickup_mode: 'stop', delivery_stop_id: 0 })} /> 予定の経由地から
                    </label>
                    <label style={{ fontSize: 13 }}>
                      <input type="radio" checked={form.pickup_mode === 'new'}
                             onChange={() => setForm({ ...form, pickup_mode: 'new', delivery_stop_id: 0 })} /> 新しい集荷地（半径内）
                    </label>
                  </div>
                  {form.pickup_mode === 'stop' ? (
                    <select value={form.pickup_stop_id} style={{ width: '100%', marginBottom: 10 }}
                            onChange={(e) => setForm({ ...form, pickup_stop_id: +e.target.value, delivery_stop_id: 0 })}>
                      <option value={0}>経由地を選択...</option>
                      {stops.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.stop_order}. {st.member_name || st.address}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select value={form.pickup_new_member_id} style={{ width: '100%', marginBottom: 10 }}
                            onChange={(e) => setForm({ ...form, pickup_new_member_id: +e.target.value })}>
                      <option value={0}>集荷地（組合員）を選択...</option>
                      {withCoords.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}

                  {/* 配達先の選択（集荷地からゴールの間の経由地のみ） */}
                  <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>配達先（集荷地〜ゴールの経由地）</div>
                  <select value={form.delivery_stop_id} style={{ width: '100%', marginBottom: 10 }}
                          onChange={(e) => setForm({ ...form, delivery_stop_id: +e.target.value })}>
                    <option value={0}>未指定</option>
                    {delCands.map((st) => (
                      <option key={st.id} value={st.id}>{st.stop_order}. {st.member_name || st.address}</option>
                    ))}
                  </select>
                  {form.pickup_mode === 'stop' && form.pickup_stop_id === 0 && (
                    <p style={{ fontSize: 12, color: '#7a8a99' }}>※ 先に集荷経由地を選ぶと配達先候補が絞られます。</p>
                  )}

                  <div className="form-grid">
                    <label>集荷物
                      <input value={form.cargo_description}
                             onChange={(e) => setForm({ ...form, cargo_description: e.target.value })} />
                    </label>
                    <label>準備完了時間
                      <input type="time" value={form.ready_time}
                             onChange={(e) => setForm({ ...form, ready_time: e.target.value })} />
                    </label>
                    <label>数量
                      <input type="number" step="0.1" value={form.quantity}
                             onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                    </label>
                    <label>重量(kg)
                      <input type="number" step="0.1" value={form.weight_kg}
                             onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={form.refrigerated}
                             onChange={(e) => setForm({ ...form, refrigerated: e.target.checked })} />
                      要冷蔵
                    </label>
                    <label className="full">備考
                      <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                    </label>
                  </div>

                  <div style={{ marginTop: 10, padding: 8, background: '#f3eefa', borderRadius: 6, fontSize: 14 }}>
                    概算料金: <b>{estFee != null ? `¥${estFee.toLocaleString()}` : '—'}</b>
                    <span style={{ fontSize: 11, color: '#7a8a99' }}>（確定は承認時）</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn" onClick={() => submit(s)}>依頼を送信</button>
                    <button className="btn secondary" onClick={() => setOpenId(null)}>キャンセル</button>
                  </div>
                </div>
              ) : (
                <button className="btn small" style={{ marginTop: 10 }} onClick={() => openForm(s.id)}>
                  集荷依頼する
                </button>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}
