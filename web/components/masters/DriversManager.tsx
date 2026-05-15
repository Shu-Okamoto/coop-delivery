'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import type { Driver, Member } from '@/lib/types';

type FormState = {
  id?: number;
  member_id: number | '';
  name: string;
  phone: string;
  pin_code: string;
  active: boolean;
};

const emptyForm: FormState = {
  member_id: '',
  name: '',
  phone: '',
  pin_code: '',
  active: true,
};

export default function DriversManager() {
  const [rows, setRows] = useState<Driver[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, m] = await Promise.all([
        apiGet<Driver[]>('/api/drivers?all=1'),
        apiGet<Member[]>('/api/members'),
      ]);
      setRows(d);
      setMembers(m);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const memberName = (id?: number | null) =>
    id ? members.find((m) => m.id === id)?.name || `ID:${id}` : '—';

  const openNew = () => {
    setForm(emptyForm);
    setEditing(false);
    setShowForm(true);
  };

  const openEdit = (d: Driver) => {
    setForm({
      id: d.id,
      member_id: d.member_id ?? '',
      name: d.name,
      phone: d.phone || '',
      pin_code: '', // 既存PINは取得できないので空。空のまま保存すれば据え置き
      active: d.active !== false,
    });
    setEditing(true);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('名前は必須です');
      return;
    }
    // 新規はPIN必須、編集は空欄なら据え置き
    if (!editing && !form.pin_code.trim()) {
      setError('新規登録ではPINが必須です');
      return;
    }
    if (form.pin_code.trim() && !/^\d{4,6}$/.test(form.pin_code.trim())) {
      setError('PINは4〜6桁の数字で入力してください');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        member_id: form.member_id === '' ? null : Number(form.member_id),
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        active: form.active,
      };
      // PINは入力がある時だけ送る
      if (form.pin_code.trim()) {
        payload.pin_code = form.pin_code.trim();
      }
      if (editing && form.id) {
        await apiPut(`/api/drivers/${form.id}`, payload);
      } else {
        await apiPost('/api/drivers', payload);
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const del = async (d: Driver) => {
    if (!confirm(`ドライバー「${d.name}」を削除しますか？\n（ルートに割当済みの場合は無効化されます）`)) return;
    try {
      const res = await apiDelete<{ soft_deleted?: boolean }>(`/api/drivers/${d.id}`);
      if (res.soft_deleted) {
        alert('このドライバーはルートに割当済みのため、削除せず「無効」にしました');
      }
      load();
    } catch (e: any) {
      alert('削除できません: ' + e.message);
    }
  };

  return (
    <div>
      <div className="toolbar">
        <button className="btn small" onClick={openNew}>＋ 新規登録</button>
        <button className="btn secondary small" onClick={load}>再読込</button>
        <span style={{ color: '#7a8a99', fontSize: 13 }}>{rows.length}名</span>
      </div>

      {error && <div className="error-box">{error}</div>}

      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{editing ? 'ドライバーを編集' : 'ドライバーを新規登録'}</h3>
          <div className="form-grid">
            <label>名前 *
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                     placeholder="例: 田中 一郎" />
            </label>
            <label>電話番号
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                     placeholder="例: 090-1234-5678" />
            </label>
            <label>所属（組合員・業者）
              <select value={form.member_id}
                      onChange={(e) => setForm({ ...form, member_id: e.target.value === '' ? '' : Number(e.target.value) })}>
                <option value="">所属なし</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
            <label>状態
              <select value={form.active ? '1' : '0'}
                      onChange={(e) => setForm({ ...form, active: e.target.value === '1' })}>
                <option value="1">稼働中</option>
                <option value="0">無効（ログイン・割当不可）</option>
              </select>
            </label>
            <label className="full">
              ログインPIN（4〜6桁の数字）{editing && ' ※変更する時だけ入力'}
              <input value={form.pin_code}
                     onChange={(e) => setForm({ ...form, pin_code: e.target.value })}
                     placeholder={editing ? '変更しない場合は空欄のまま' : '例: 1234'}
                     inputMode="numeric" maxLength={6} />
            </label>
          </div>
          <p style={{ fontSize: 12, color: '#7a8a99', marginTop: 8 }}>
            ※ PINはドライバー画面のログインに使います。セキュリティ上、一覧には表示されません。
            {editing && ' 編集時は空欄のまま保存すると現在のPINが維持されます。'}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? '保存中...' : editing ? '更新' : '登録'}
            </button>
            <button className="btn secondary" onClick={() => setShowForm(false)}>キャンセル</button>
          </div>
        </div>
      )}

      {loading ? (
        <p>読込中...</p>
      ) : rows.length === 0 ? (
        <p className="empty">ドライバーがまだ登録されていません</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>名前</th><th>電話番号</th><th>所属</th><th>PIN</th><th>状態</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} style={{ opacity: d.active === false ? 0.5 : 1 }}>
                <td>{d.name}</td>
                <td style={{ fontSize: 12 }}>{d.phone || '—'}</td>
                <td style={{ fontSize: 12 }}>{memberName(d.member_id)}</td>
                <td style={{ fontSize: 12, color: '#95a5a6' }}>••••（非表示）</td>
                <td>{d.active === false
                  ? <span style={{ color: '#95a5a6' }}>無効</span>
                  : <span style={{ color: '#27ae60' }}>稼働中</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn small" onClick={() => openEdit(d)}>編集</button>{' '}
                  <button className="btn danger small" onClick={() => del(d)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
