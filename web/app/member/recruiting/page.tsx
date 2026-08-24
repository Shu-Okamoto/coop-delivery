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

const fmtDeadline = (t: string | null) => (t ? new Date(t).toLocaleString('ja-JP') : '—');

export default function RecruitingPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 依頼フォーム
  const [form, setForm] = useState({
    pickup_member_id: 0, cargo_description: '', ready_time: '',
    quantity: '', weight_kg: '', refrigerated: false,
    delivery_member_id: 0, note: '',
  });
  const [estFee, setEstFee] = useState<number | null>(null);

  const load = () => {
    memberGet<Schedule[]>('/api/schedules?status=recruiting').then(setSchedules).catch((e) => setError(e.message));
  };

  useEffect(() => {
    if (!getMemberSession()) { location.href = '/member'; return; }
    load();
    apiGet<Member[]>('/api/members').then(setMembers).catch(() => {});
  }, []);

  const openForm = (id: number) => {
    const me = getMemberSession();
    const myMember = members.find((m) => m.id === me?.id);
    setForm({
      pickup_member_id: myMember?.id || 0,
      cargo_description: '', ready_time: '',
      quantity: '', weight_kg: '', refrigerated: false,
      delivery_member_id: 0, note: '',
    });
    setMsg(null); setError(null);
    setOpenId(id);
  };

  const submit = async (schedule: Schedule) => {
    setError(null); setMsg(null);
    const pickup = members.find((m) => m.id === form.pickup_member_id);
    if (!pickup || pickup.lat == null || pickup.lng == null) {
      setError('集荷場所（座標のある組合員）を選択してください'); return;
    }
    const delivery = members.find((m) => m.id === form.delivery_member_id);
    try {
      await memberPost(`/api/schedules/${schedule.id}/requests`, {
        pickup_address: pickup.address, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        cargo_description: form.cargo_description,
        ready_time: form.ready_time || null,
        quantity: form.quantity, weight_kg: form.weight_kg,
        refrigerated: form.refrigerated,
        delivery_member_id: delivery?.id || null,
        delivery_address: delivery?.address || null,
        delivery_lat: delivery?.lat ?? null, delivery_lng: delivery?.lng ?? null,
        note: form.note,
      });
      setMsg('集荷依頼を送信しました。作成者の承認をお待ちください。');
      setOpenId(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  // フォーム変更に応じて概算料金を計算
  useEffect(() => {
    if (openId == null) { setEstFee(null); return; }
    const pickup = members.find((m) => m.id === form.pickup_member_id);
    if (!pickup || pickup.lat == null || pickup.lng == null) { setEstFee(null); return; }
    const delivery = members.find((m) => m.id === form.delivery_member_id);
    memberPost<{ fee: number }>('/api/pricing/quote', {
      pickup_lat: pickup.lat, pickup_lng: pickup.lng,
      delivery_lat: delivery?.lat ?? null, delivery_lng: delivery?.lng ?? null,
      weight_kg: form.weight_kg, refrigerated: form.refrigerated,
    }).then((r) => setEstFee(r.fee)).catch(() => setEstFee(null));
  }, [openId, form.pickup_member_id, form.delivery_member_id, form.weight_kg, form.refrigerated, members]);

  const withCoords = members.filter((m) => m.lat != null && m.lng != null);

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

        {schedules.map((s) => (
          <div key={s.id} className="card">
            <h3 style={{ marginTop: 0 }}>
              {s.name}{' '}
              <span className="badge" style={{ background: '#8e44ad' }}>集荷募集中</span>
            </h3>
            <div style={{ fontSize: 13, color: '#555' }}>
              配送日: {s.scheduled_date} / 作成: {s.creator_name || '—'}<br />
              締切: {fmtDeadline(s.pickup_deadline)}（前日18時）<br />
              受付範囲: ルート中心から半径 {s.radius_km}km 以内
            </div>

            {openId === s.id ? (
              <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
                <div className="form-grid">
                  <label>集荷場所（自分/組合員）
                    <select value={form.pickup_member_id}
                            onChange={(e) => setForm({ ...form, pickup_member_id: +e.target.value })}>
                      <option value={0}>選択...</option>
                      {withCoords.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </label>
                  <label>配達先（組合員）
                    <select value={form.delivery_member_id}
                            onChange={(e) => setForm({ ...form, delivery_member_id: +e.target.value })}>
                      <option value={0}>未指定</option>
                      {withCoords.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </label>
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
        ))}
      </main>
    </div>
  );
}
