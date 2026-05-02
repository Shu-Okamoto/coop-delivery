'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, statusLabel } from '@/lib/api';

type Member = { id: number; code: string; name: string };
type Req = {
  id: number;
  request_code: string;
  shipper_name: string;
  receiver_name: string;
  weight_kg: number;
  refrigerated: boolean;
  pickup_window_start: string;
  status: string;
};

export default function RequestsPage() {
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<Req[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    shipper_id: 0,
    receiver_id: 0,
    pickup_window_start: '',
    pickup_window_end: '',
    delivery_deadline: '',
    weight_kg: 0,
    refrigerated: false,
    cargo_description: '',
  });

  const load = async () => {
    const data = await apiGet<Req[]>(`/api/requests${filter ? `?status=${filter}` : ''}`);
    setRows(data);
  };

  useEffect(() => { load(); }, [filter]);
  useEffect(() => { apiGet<Member[]>('/api/members').then(setMembers); }, []);

  const openForm = () => {
    const t1 = new Date(); t1.setDate(t1.getDate() + 1); t1.setHours(8, 0, 0, 0);
    const t2 = new Date(t1); t2.setHours(11, 0);
    const t3 = new Date(t1); t3.setHours(16, 0);
    const toLocal = (d: Date) => d.toISOString().slice(0, 16);
    setForm({
      shipper_id: members[0]?.id || 0,
      receiver_id: members[1]?.id || 0,
      pickup_window_start: toLocal(t1),
      pickup_window_end: toLocal(t2),
      delivery_deadline: toLocal(t3),
      weight_kg: 50,
      refrigerated: false,
      cargo_description: '',
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.weight_kg) { alert('重量を入力してください'); return; }
    if (form.shipper_id === form.receiver_id) { alert('発荷主と届け先が同一です'); return; }
    try {
      await apiPost('/api/requests', form);
      setShowForm(false);
      load();
    } catch (e: any) {
      alert('登録失敗: ' + e.message);
    }
  };

  return (
    <>
      <h2>配送依頼一覧</h2>
      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">すべて</option>
          <option value="pending">未割当</option>
          <option value="matched">マッチ済</option>
          <option value="picked_up">集荷済</option>
          <option value="delivered">配達完了</option>
        </select>
        <button className="btn" onClick={openForm}>＋ 新規依頼</button>
      </div>

      {showForm && (
        <div className="card">
          <h3>配送依頼の登録</h3>
          <div className="form-grid">
            <label>発荷主
              <select value={form.shipper_id} onChange={(e) => setForm({ ...form, shipper_id: +e.target.value })}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
              </select>
            </label>
            <label>届け先
              <select value={form.receiver_id} onChange={(e) => setForm({ ...form, receiver_id: +e.target.value })}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
              </select>
            </label>
            <label>集荷開始
              <input type="datetime-local" value={form.pickup_window_start}
                     onChange={(e) => setForm({ ...form, pickup_window_start: e.target.value })} />
            </label>
            <label>集荷終了
              <input type="datetime-local" value={form.pickup_window_end}
                     onChange={(e) => setForm({ ...form, pickup_window_end: e.target.value })} />
            </label>
            <label>配達期限
              <input type="datetime-local" value={form.delivery_deadline}
                     onChange={(e) => setForm({ ...form, delivery_deadline: e.target.value })} />
            </label>
            <label>重量(kg)
              <input type="number" step="0.1" value={form.weight_kg}
                     onChange={(e) => setForm({ ...form, weight_kg: +e.target.value })} />
            </label>
            <label>冷蔵
              <select value={form.refrigerated ? '1' : '0'}
                      onChange={(e) => setForm({ ...form, refrigerated: e.target.value === '1' })}>
                <option value="0">不要</option>
                <option value="1">必要</option>
              </select>
            </label>
            <label className="full">荷物内容
              <input type="text" value={form.cargo_description}
                     onChange={(e) => setForm({ ...form, cargo_description: e.target.value })} />
            </label>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="btn" onClick={submit}>登録</button>
            <button className="btn secondary" onClick={() => setShowForm(false)}>キャンセル</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p>依頼がありません</p>
      ) : (
        <table>
          <thead>
            <tr><th>コード</th><th>発荷主</th><th>届け先</th><th>重量</th><th>冷蔵</th><th>集荷時間</th><th>状態</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.request_code}</td>
                <td>{r.shipper_name}</td>
                <td>{r.receiver_name}</td>
                <td>{r.weight_kg}kg</td>
                <td>{r.refrigerated ? '❄️' : '-'}</td>
                <td>{new Date(r.pickup_window_start).toLocaleString('ja-JP')}</td>
                <td className={`status-${r.status}`}>{statusLabel(r.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
