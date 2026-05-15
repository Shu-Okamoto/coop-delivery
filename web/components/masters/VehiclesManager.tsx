'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import type { Vehicle } from '@/lib/types';

type FormState = {
  id?: number;
  code: string;
  name: string;
  plate_number: string;
  vehicle_type: string;
  capacity_kg: number;
  refrigerated: boolean;
  active: boolean;
};

const emptyForm: FormState = {
  code: '',
  name: '',
  plate_number: '',
  vehicle_type: '',
  capacity_kg: 1000,
  refrigerated: false,
  active: true,
};

export default function VehiclesManager() {
  const [rows, setRows] = useState<Vehicle[]>([]);
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
      // ?all=1 で非アクティブ車両も表示
      setRows(await apiGet<Vehicle[]>('/api/vehicles?all=1'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm(emptyForm);
    setEditing(false);
    setShowForm(true);
  };

  const openEdit = (v: Vehicle) => {
    setForm({
      id: v.id,
      code: v.code,
      name: v.name,
      plate_number: v.plate_number || '',
      vehicle_type: v.vehicle_type || '',
      capacity_kg: v.capacity_kg ?? 1000,
      refrigerated: !!v.refrigerated,
      active: v.active !== false,
    });
    setEditing(true);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError('コードと名称は必須です');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        plate_number: form.plate_number.trim() || null,
        vehicle_type: form.vehicle_type.trim() || null,
        capacity_kg: Number(form.capacity_kg) || 0,
        refrigerated: form.refrigerated,
        active: form.active,
      };
      if (editing && form.id) {
        await apiPut(`/api/vehicles/${form.id}`, payload);
      } else {
        await apiPost('/api/vehicles', payload);
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const del = async (v: Vehicle) => {
    if (!confirm(`「${v.name}」を削除しますか？\n（ルートで使用中の場合は無効化されます）`)) return;
    try {
      const res = await apiDelete<{ soft_deleted?: boolean }>(`/api/vehicles/${v.id}`);
      if (res.soft_deleted) {
        alert('この車両はルートで使用中のため、削除せず「無効」にしました');
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
        <span style={{ color: '#7a8a99', fontSize: 13 }}>{rows.length}件</span>
      </div>

      {error && <div className="error-box">{error}</div>}

      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{editing ? '車両を編集' : '車両を新規登録'}</h3>
          <div className="form-grid">
            <label>コード *
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                     placeholder="例: V004" />
            </label>
            <label>名称 *
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                     placeholder="例: 2tトラック2号" />
            </label>
            <label>ナンバープレート
              <input value={form.plate_number}
                     onChange={(e) => setForm({ ...form, plate_number: e.target.value })}
                     placeholder="例: 山口100あ1234" />
            </label>
            <label>車種
              <input value={form.vehicle_type}
                     onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}
                     placeholder="例: 2tトラック / 軽トラ" />
            </label>
            <label>最大積載量 (kg)
              <input type="number" value={form.capacity_kg}
                     onChange={(e) => setForm({ ...form, capacity_kg: Number(e.target.value) })} />
            </label>
            <label>冷蔵対応
              <select value={form.refrigerated ? '1' : '0'}
                      onChange={(e) => setForm({ ...form, refrigerated: e.target.value === '1' })}>
                <option value="0">なし</option>
                <option value="1">あり（冷蔵車）</option>
              </select>
            </label>
            <label>状態
              <select value={form.active ? '1' : '0'}
                      onChange={(e) => setForm({ ...form, active: e.target.value === '1' })}>
                <option value="1">稼働中</option>
                <option value="0">無効（一覧・選択肢に出さない）</option>
              </select>
            </label>
          </div>
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
        <p className="empty">車両がまだ登録されていません</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>コード</th><th>名称</th><th>ナンバー</th><th>車種</th>
              <th>積載量</th><th>冷蔵</th><th>状態</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} style={{ opacity: v.active === false ? 0.5 : 1 }}>
                <td>{v.code}</td>
                <td>{v.name}</td>
                <td style={{ fontSize: 12 }}>{v.plate_number || '—'}</td>
                <td style={{ fontSize: 12 }}>{v.vehicle_type || '—'}</td>
                <td>{v.capacity_kg}kg</td>
                <td>{v.refrigerated ? '❄️ あり' : '—'}</td>
                <td>{v.active === false
                  ? <span style={{ color: '#95a5a6' }}>無効</span>
                  : <span style={{ color: '#27ae60' }}>稼働中</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn small" onClick={() => openEdit(v)}>編集</button>{' '}
                  <button className="btn danger small" onClick={() => del(v)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
